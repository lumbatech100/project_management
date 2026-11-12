import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import {
  optimizeDrawing,
  optimizeDrawingHi,
  pdfFirstPageToPng,
} from "@/lib/image";
import { prisma } from "@/lib/prisma";
import { canManageDrawing } from "@/lib/utils";

type Params = { params: Promise<{ id: string; floorId: string }> };

const ALLOWED_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".tif",
  ".tiff",
  ".pdf",
]);
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const FORMAT_ERROR = "Format drawing harus JPG, PNG, WEBP, TIFF, atau PDF";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function verifyPassword(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  return compare(password, user.password);
}

function filenameFromUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("/api/uploads/")) return url.slice("/api/uploads/".length);
  if (url.startsWith("/uploads/")) return url.slice("/uploads/".length);
  return null;
}

export async function POST(req: NextRequest, props: Params) {
  const params = await props.params;
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await forbidUnlessProjectAccess(
    session.user.id,
    session.user.role,
    params.id
  );
  if (denied) return denied;
  if (!canManageDrawing(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const floor = await prisma.floor.findFirst({
    where: { id: params.floorId, projectId: params.id },
  });
  if (!floor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "File terlalu besar atau request tidak valid (max 100MB)" },
      { status: 413 }
    );
  }

  // Ganti drawing yang sudah ada → wajib password
  if (floor.drawingUrl) {
    const password = String(form.get("password") || "");
    if (!password) {
      return NextResponse.json(
        { error: "Password wajib untuk ganti drawing" },
        { status: 400 }
      );
    }
    const ok = await verifyPassword(session.user.id, password);
    if (!ok) {
      return NextResponse.json({ error: "Password salah" }, { status: 403 });
    }
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "File wajib" }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (ext === ".heic" || ext === ".heif") {
    return NextResponse.json(
      {
        error:
          "Format HEIC (foto iPhone) belum didukung. Ubah ke JPG dulu, atau set kamera iPhone ke 'Most Compatible'.",
      },
      { status: 400 }
    );
  }
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json({ error: FORMAT_ERROR }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Ukuran file maksimal 100MB" },
      { status: 400 }
    );
  }

  let bytes: Buffer = Buffer.from(await file.arrayBuffer());
  if (ext === ".pdf") {
    try {
      bytes = await pdfFirstPageToPng(bytes);
    } catch (err) {
      console.error("[drawing upload] PDF render failed", err);
      return NextResponse.json(
        { error: "PDF gagal dibaca. Pastikan file tidak rusak / tidak dipassword." },
        { status: 400 }
      );
    }
  }
  const preferredExt = ext === ".png" ? ".png" : ".jpg";
  let optimized: { buffer: Buffer; ext: ".jpg" | ".png" };
  try {
    optimized = await optimizeDrawing(bytes, preferredExt);
  } catch (err) {
    console.error("[drawing upload] optimize failed", err);
    return NextResponse.json(
      { error: "File gambar tidak valid / rusak" },
      { status: 400 }
    );
  }
  let hiBuffer: Buffer | null = null;
  try {
    hiBuffer = await optimizeDrawingHi(bytes);
  } catch (err) {
    // Versi zoom opsional — drawing tetap tersimpan walau ini gagal
    console.error("[drawing upload] hi-res failed", err);
  }

  const stamp = Date.now();
  const filename = `${params.floorId}-${stamp}${optimized.ext}`;
  const hiFilename = hiBuffer ? `${params.floorId}-${stamp}-hi.jpg` : null;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), optimized.buffer);
  if (hiBuffer && hiFilename) {
    await writeFile(path.join(uploadDir, hiFilename), hiBuffer);
  }

  // Update DB dulu sebelum menyentuh file lama: kalau urutannya dibalik
  // (hapus file lama dulu, baru update DB) dan update-nya gagal, record akan
  // menunjuk ke file lama yang sudah terhapus ("broken image") tanpa cara
  // pulih. Kalau update DB gagal di sini, file baru yang sudah ditulis
  // di-rollback supaya tidak nyangkut yatim di disk.
  let updated;
  try {
    updated = await prisma.floor.update({
      where: { id: params.floorId },
      data: {
        drawingUrl: `/api/uploads/${filename}`,
        drawingHiUrl: hiFilename ? `/api/uploads/${hiFilename}` : null,
      },
    });
  } catch (err) {
    console.error("[drawing upload] db update failed", err);
    await unlink(path.join(uploadDir, filename)).catch(() => {});
    if (hiFilename) {
      await unlink(path.join(uploadDir, hiFilename)).catch(() => {});
    }
    return NextResponse.json(
      { error: "Gagal menyimpan drawing. Coba lagi." },
      { status: 500 }
    );
  }

  for (const oldUrl of [floor.drawingUrl, floor.drawingHiUrl]) {
    const oldName = filenameFromUrl(oldUrl);
    if (!oldName) continue;
    try {
      await unlink(path.join(uploadDir, oldName));
    } catch {
      // ignore
    }
  }

  return NextResponse.json(updated);
}

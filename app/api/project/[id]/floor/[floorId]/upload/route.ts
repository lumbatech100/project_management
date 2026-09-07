import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { compare } from "bcryptjs";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { authOptions } from "@/lib/auth";
import { optimizeDrawing } from "@/lib/image";
import { prisma } from "@/lib/prisma";
import { canManageDrawing } from "@/lib/utils";

type Params = { params: { id: string; floorId: string } };

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png"]);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png"]);
const MAX_BYTES = 30 * 1024 * 1024; // 30 MB

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

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageDrawing(session.user.role)) {
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
      { error: "File terlalu besar atau request tidak valid (max 30MB)" },
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
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: "Format harus JPG atau PNG" },
      { status: 400 }
    );
  }

  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Format harus JPG atau PNG" },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Ukuran file maksimal 30MB (JPG/PNG)" },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const preferredExt = ext === ".png" ? ".png" : ".jpg";
  let optimized: { buffer: Buffer; ext: ".jpg" | ".png" };
  try {
    optimized = await optimizeDrawing(bytes, preferredExt);
  } catch {
    return NextResponse.json(
      { error: "File gambar tidak valid / rusak" },
      { status: 400 }
    );
  }
  const filename = `${params.floorId}-${Date.now()}${optimized.ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), optimized.buffer);

  const oldName = filenameFromUrl(floor.drawingUrl);
  if (oldName) {
    try {
      await unlink(path.join(uploadDir, oldName));
    } catch {
      // ignore
    }
  }

  const drawingUrl = `/api/uploads/${filename}`;
  const updated = await prisma.floor.update({
    where: { id: params.floorId },
    data: { drawingUrl },
  });

  return NextResponse.json(updated);
}

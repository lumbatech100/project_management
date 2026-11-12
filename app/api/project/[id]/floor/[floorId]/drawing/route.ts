import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { unlink } from "fs/promises";
import path from "path";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageDrawing } from "@/lib/utils";

type Params = { params: Promise<{ id: string; floorId: string }> };

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

async function removeFile(drawingUrl: string | null | undefined) {
  const filename = filenameFromUrl(drawingUrl);
  if (!filename) return;
  const filePath = path.join(process.cwd(), "public", "uploads", filename);
  try {
    await unlink(filePath);
  } catch {
    // ignore missing file
  }
}

/** Hapus drawing — wajib password akun login */
export async function DELETE(req: NextRequest, props: Params) {
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

  const body = await req.json().catch(() => ({}));
  const password = body.password as string | undefined;
  if (!password) {
    return NextResponse.json({ error: "Password wajib diisi" }, { status: 400 });
  }

  const ok = await verifyPassword(session.user.id, password);
  if (!ok) {
    return NextResponse.json({ error: "Password salah" }, { status: 403 });
  }

  const floor = await prisma.floor.findFirst({
    where: { id: params.floorId, projectId: params.id },
  });
  if (!floor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!floor.drawingUrl) {
    return NextResponse.json({ error: "Belum ada drawing" }, { status: 400 });
  }

  // Update DB dulu, baru hapus file fisik — kalau urutannya dibalik dan update
  // DB gagal di tengah jalan, record akan menunjuk ke file yang sudah hilang
  // dan tidak bisa direcover.
  let updated;
  try {
    updated = await prisma.floor.update({
      where: { id: params.floorId },
      data: { drawingUrl: null, drawingHiUrl: null },
    });
  } catch (err) {
    console.error("[drawing delete] db update failed", err);
    return NextResponse.json(
      { error: "Gagal menghapus drawing. Coba lagi." },
      { status: 500 }
    );
  }

  await removeFile(floor.drawingUrl);
  await removeFile(floor.drawingHiUrl);

  return NextResponse.json(updated);
}

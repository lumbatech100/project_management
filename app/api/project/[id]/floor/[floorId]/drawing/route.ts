import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { compare } from "bcryptjs";
import { unlink } from "fs/promises";
import path from "path";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageDrawing } from "@/lib/utils";

type Params = { params: { id: string; floorId: string } };

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
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageDrawing(session.user.role)) {
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

  await removeFile(floor.drawingUrl);

  const updated = await prisma.floor.update({
    where: { id: params.floorId },
    data: { drawingUrl: null },
  });

  return NextResponse.json(updated);
}

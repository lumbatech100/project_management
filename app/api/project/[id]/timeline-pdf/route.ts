import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { compare } from "bcryptjs";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageDrawing } from "@/lib/utils";

type Params = { params: { id: string } };

const ALLOWED_EXT = new Set([".pdf"]);
const ALLOWED_MIME = new Set(["application/pdf"]);
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

async function removeFile(fileUrl: string | null | undefined) {
  const filename = filenameFromUrl(fileUrl);
  if (!filename) return;
  const filePath = path.join(process.cwd(), "public", "uploads", filename);
  try {
    await unlink(filePath);
  } catch {
    // ignore
  }
}

/** Upload / ganti PDF rencana timeline */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageDrawing(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) {
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

  if (project.timelinePdfUrl) {
    const password = String(form.get("password") || "");
    if (!password) {
      return NextResponse.json(
        { error: "Password wajib untuk ganti PDF timeline" },
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
    return NextResponse.json({ error: "Format harus PDF" }, { status: 400 });
  }

  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: "Format harus PDF" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Ukuran file maksimal 30MB" },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = `timeline-${params.id}-${Date.now()}.pdf`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), bytes);

  await removeFile(project.timelinePdfUrl);

  const timelinePdfUrl = `/api/uploads/${filename}`;
  const updated = await prisma.project.update({
    where: { id: params.id },
    data: { timelinePdfUrl },
  });

  return NextResponse.json({ timelinePdfUrl: updated.timelinePdfUrl });
}

/** Hapus PDF timeline — wajib password */
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

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!project.timelinePdfUrl) {
    return NextResponse.json({ error: "Belum ada PDF timeline" }, { status: 400 });
  }

  await removeFile(project.timelinePdfUrl);

  const updated = await prisma.project.update({
    where: { id: params.id },
    data: { timelinePdfUrl: null },
  });

  return NextResponse.json({ timelinePdfUrl: updated.timelinePdfUrl });
}

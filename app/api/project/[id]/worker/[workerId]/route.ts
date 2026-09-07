import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageWorkers } from "@/lib/utils";

type Params = { params: { id: string; workerId: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const worker = await prisma.worker.findFirst({
    where: { id: params.workerId, projectId: params.id },
  });
  if (!worker) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(worker);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageWorkers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.worker.findFirst({
    where: { id: params.workerId, projectId: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : existing.name;
  const position =
    typeof body.position === "string" ? body.position.trim() : existing.position;
  if (!name) {
    return NextResponse.json({ error: "Nama wajib" }, { status: 400 });
  }
  if (!position) {
    return NextResponse.json({ error: "Jabatan wajib" }, { status: 400 });
  }

  const parentId: string | null =
    body.parentId === null || body.parentId === ""
      ? null
      : typeof body.parentId === "string"
        ? body.parentId
        : existing.parentId;

  if (parentId === params.workerId) {
    return NextResponse.json(
      { error: "Tidak bisa menjadikan diri sendiri sebagai atasan" },
      { status: 400 }
    );
  }

  if (parentId) {
    const parent = await prisma.worker.findFirst({
      where: { id: parentId, projectId: params.id },
    });
    if (!parent) {
      return NextResponse.json({ error: "Atasan tidak valid" }, { status: 400 });
    }
    // prevent cycle: walk up from parent
    const all = await prisma.worker.findMany({
      where: { projectId: params.id },
      select: { id: true, parentId: true },
    });
    const parentMap = new Map(all.map((w) => [w.id, w.parentId]));
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === params.workerId) {
        return NextResponse.json(
          { error: "Struktur organisasi tidak valid (siklus)" },
          { status: 400 }
        );
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = parentMap.get(cursor) ?? null;
    }
  }

  const worker = await prisma.worker.update({
    where: { id: params.workerId },
    data: {
      name,
      position,
      phone: body.phone !== undefined ? body.phone?.trim() || null : undefined,
      email: body.email !== undefined ? body.email?.trim() || null : undefined,
      notes: body.notes !== undefined ? body.notes?.trim() || null : undefined,
      parentId,
      joinedAt:
        body.joinedAt !== undefined
          ? body.joinedAt
            ? new Date(body.joinedAt)
            : null
          : undefined,
      active: typeof body.active === "boolean" ? body.active : undefined,
    },
  });

  return NextResponse.json(worker);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageWorkers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.worker.findFirst({
    where: { id: params.workerId, projectId: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // children become root
  await prisma.worker.updateMany({
    where: { parentId: params.workerId },
    data: { parentId: null },
  });

  await prisma.worker.delete({ where: { id: params.workerId } });
  return NextResponse.json({ ok: true });
}

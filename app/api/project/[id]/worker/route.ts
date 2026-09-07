import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageWorkers } from "@/lib/utils";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workers = await prisma.worker.findMany({
    where: { projectId: params.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(workers);
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageWorkers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const position = typeof body.position === "string" ? body.position.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Nama wajib" }, { status: 400 });
  }
  if (!position) {
    return NextResponse.json({ error: "Jabatan wajib" }, { status: 400 });
  }

  const parentId: string | null =
    typeof body.parentId === "string" && body.parentId ? body.parentId : null;
  if (parentId) {
    const parent = await prisma.worker.findFirst({
      where: { id: parentId, projectId: params.id },
    });
    if (!parent) {
      return NextResponse.json({ error: "Atasan tidak valid" }, { status: 400 });
    }
  }

  const worker = await prisma.worker.create({
    data: {
      projectId: params.id,
      name,
      position,
      phone: body.phone?.trim() || null,
      email: body.email?.trim() || null,
      notes: body.notes?.trim() || null,
      parentId,
      joinedAt: body.joinedAt ? new Date(body.joinedAt) : null,
      active: body.active !== false,
    },
  });

  return NextResponse.json(worker);
}

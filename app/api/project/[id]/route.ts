import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { compare } from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCreateProject } from "@/lib/utils";

type Params = { params: { id: string } };

async function verifyPassword(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  return compare(password, user.password);
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      floors: {
        orderBy: { createdAt: "asc" },
        include: {
          markers: {
            include: { items: { orderBy: { name: "asc" } } },
          },
        },
      },
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canCreateProject(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.project.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Nama project wajib" }, { status: 400 });
  }

  const description =
    typeof body.description === "string" ? body.description.trim() : null;
  const status =
    body.status === "completed" || body.status === "active"
      ? body.status
      : existing.status;

  const project = await prisma.project.update({
    where: { id: params.id },
    data: {
      name,
      description: description || null,
      status,
    },
  });

  return NextResponse.json(project);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canCreateProject(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const confirmName =
    typeof body.confirmName === "string" ? body.confirmName.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!confirmName) {
    return NextResponse.json(
      { error: "Ketik nama project untuk konfirmasi" },
      { status: 400 }
    );
  }
  if (confirmName !== project.name) {
    return NextResponse.json(
      { error: "Nama project tidak cocok" },
      { status: 400 }
    );
  }
  if (!password) {
    return NextResponse.json({ error: "Password wajib diisi" }, { status: 400 });
  }

  const ok = await verifyPassword(session.user.id, password);
  if (!ok) {
    return NextResponse.json({ error: "Password salah" }, { status: 403 });
  }

  await prisma.project.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

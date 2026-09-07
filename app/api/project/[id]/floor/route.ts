import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageDrawing } from "@/lib/utils";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const floors = await prisma.floor.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "asc" },
    include: {
      markers: {
        include: { items: { orderBy: { name: "asc" } } },
      },
    },
  });

  return NextResponse.json(floors);
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageDrawing(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Nama wajib diisi" }, { status: 400 });
  }

  const floor = await prisma.floor.create({
    data: {
      projectId: params.id,
      name: body.name.trim(),
    },
  });

  return NextResponse.json(floor, { status: 201 });
}

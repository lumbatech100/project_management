import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageDrawing } from "@/lib/utils";

type Params = { params: { id: string; markerId: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageDrawing(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const marker = await prisma.marker.findFirst({
    where: {
      id: params.markerId,
      floor: { projectId: params.id },
    },
  });
  if (!marker) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const bobot = parseFloat(body.bobot);
  if (!body.name?.trim() || Number.isNaN(bobot)) {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const item = await prisma.breakdownItem.create({
    data: {
      markerId: params.markerId,
      name: body.name.trim(),
      bobot,
    },
  });

  return NextResponse.json(item, { status: 201 });
}

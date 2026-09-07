import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageDrawing } from "@/lib/utils";

type Params = { params: { id: string; floorId: string } };

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

  const body = await req.json();
  const { label, x, y } = body;
  if (!label?.trim() || typeof x !== "number" || typeof y !== "number") {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const marker = await prisma.marker.create({
    data: {
      floorId: params.floorId,
      label: label.trim(),
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    },
  });

  return NextResponse.json(marker, { status: 201 });
}

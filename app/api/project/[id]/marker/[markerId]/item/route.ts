import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canEditBreakdown } from "@/lib/utils";

type Params = { params: Promise<{ id: string; markerId: string }> };

export async function POST(req: NextRequest, props: Params) {
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
  if (!canEditBreakdown(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const marker = await prisma.marker.findFirst({
    where: {
      id: params.markerId,
      floor: { projectId: params.id },
    },
    include: {
      items: { select: { sortOrder: true }, orderBy: { sortOrder: "desc" }, take: 1 },
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

  const nextOrder = (marker.items[0]?.sortOrder ?? -1) + 1;

  const item = await prisma.breakdownItem.create({
    data: {
      markerId: params.markerId,
      name: body.name.trim(),
      bobot,
      sortOrder: nextOrder,
    },
  });

  return NextResponse.json(item, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageTimeline } from "@/lib/utils";

type Params = { params: Promise<{ id: string; floorId: string }> };

export async function PUT(req: NextRequest, props: Params) {
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
  if (!canManageTimeline(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const floor = await prisma.floor.findFirst({
    where: { id: params.floorId, projectId: params.id },
  });
  if (!floor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const plannedStart = body.plannedStart
    ? new Date(body.plannedStart)
    : null;
  const plannedEnd = body.plannedEnd ? new Date(body.plannedEnd) : null;

  if (plannedStart && Number.isNaN(plannedStart.getTime())) {
    return NextResponse.json({ error: "Tanggal start tidak valid" }, { status: 400 });
  }
  if (plannedEnd && Number.isNaN(plannedEnd.getTime())) {
    return NextResponse.json({ error: "Tanggal end tidak valid" }, { status: 400 });
  }
  if (plannedStart && plannedEnd && plannedEnd < plannedStart) {
    return NextResponse.json(
      { error: "Planned end harus setelah planned start" },
      { status: 400 }
    );
  }

  const updated = await prisma.floor.update({
    where: { id: params.floorId },
    data: {
      plannedStart,
      plannedEnd,
    },
  });

  return NextResponse.json(updated);
}

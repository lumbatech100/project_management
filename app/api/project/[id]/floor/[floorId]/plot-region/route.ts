import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageDrawing } from "@/lib/utils";
import {
  parsePlotRegion,
  pointInRegion,
  type PlotRegion,
} from "@/lib/plot-region";

type Params = { params: Promise<{ id: string; floorId: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Simpan / hapus area plot lantai.
 * Body: { region: {x,y,w,h} | null, removeOutside?: boolean }
 * removeOutside: hapus plot yang berada di luar area (yang sudah ada progress
 * tidak ikut terhapus).
 */
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
  if (!canManageDrawing(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const floor = await prisma.floor.findFirst({
    where: { id: params.floorId, projectId: params.id },
    select: { id: true },
  });
  if (!floor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const raw = (body as { region?: unknown }).region;
  const removeOutside = Boolean(
    (body as { removeOutside?: unknown }).removeOutside
  );

  let region: PlotRegion | null = null;
  if (raw !== null && raw !== undefined) {
    region = parsePlotRegion(raw);
    if (!region) {
      return NextResponse.json(
        { error: "Area plot tidak valid atau terlalu kecil" },
        { status: 400 }
      );
    }
  }

  await prisma.floor.update({
    where: { id: floor.id },
    data: { plotRegion: region ?? Prisma.DbNull },
  });

  const deletedIds: string[] = [];
  let skippedLocked = 0;
  if (region && removeOutside) {
    const markers = await prisma.marker.findMany({
      where: { floorId: floor.id },
      include: {
        items: { select: { status: true, progressPct: true, done: true } },
      },
    });
    for (const m of markers) {
      if (pointInRegion(m.x, m.y, region)) continue;
      const locked = m.items.some(
        (i) => i.status === "SUBMITTED" || i.progressPct > 0 || i.done
      );
      if (locked) skippedLocked += 1;
      else deletedIds.push(m.id);
    }
    if (deletedIds.length > 0) {
      await prisma.marker.deleteMany({
        where: { id: { in: deletedIds }, floorId: floor.id },
      });
    }
  }

  return NextResponse.json({ region, deletedIds, skippedLocked });
}

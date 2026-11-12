import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageDrawing } from "@/lib/utils";
import {
  buildChecklistItems,
  isDoorProfileCode,
  profileAllowsKeyswitch,
} from "@/lib/door-profiles";
import { sanitizeMarkerColor } from "@/lib/marker-color";

type Params = { params: Promise<{ id: string; floorId: string }> };

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
  if (!canManageDrawing(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const floor = await prisma.floor.findFirst({
    where: { id: params.floorId, projectId: params.id },
  });
  if (!floor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { label, x, y, profileCode, hasKeyswitch, color } = body;
  if (!label?.trim() || typeof x !== "number" || typeof y !== "number") {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }
  if (!isDoorProfileCode(profileCode)) {
    return NextResponse.json(
      { error: "Profil pintu wajib dipilih" },
      { status: 400 }
    );
  }

  const keyswitch =
    profileAllowsKeyswitch(profileCode) && Boolean(hasKeyswitch);
  const checklist = buildChecklistItems(profileCode, keyswitch);

  const marker = await prisma.marker.create({
    data: {
      floorId: params.floorId,
      label: label.trim(),
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      profileCode,
      hasKeyswitch: keyswitch,
      color: sanitizeMarkerColor(color),
      items: {
        create: checklist.map((c, i) => ({
          name: c.name,
          bobot: c.bobot,
          sortOrder: i,
        })),
      },
    },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  return NextResponse.json(marker, { status: 201 });
}

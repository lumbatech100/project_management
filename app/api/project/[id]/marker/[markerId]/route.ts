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

type Params = { params: Promise<{ id: string; markerId: string }> };

export async function DELETE(req: NextRequest, props: Params) {
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

  const marker = await prisma.marker.findFirst({
    where: {
      id: params.markerId,
      floor: { projectId: params.id },
    },
  });
  if (!marker) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.marker.delete({ where: { id: params.markerId } });
  return NextResponse.json({ ok: true });
}

/**
 * Update label / profil. Ganti checklist hanya jika semua item masih OPEN
 * (belum submit/approve) — agar progress lapangan tidak hilang.
 */
export async function PATCH(req: NextRequest, props: Params) {
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

  const marker = await prisma.marker.findFirst({
    where: {
      id: params.markerId,
      floor: { projectId: params.id },
    },
    include: { items: true },
  });
  if (!marker) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const label =
    typeof body.label === "string" ? body.label.trim() : undefined;
  const profileCode = body.profileCode;
  const hasKeyswitchRaw = body.hasKeyswitch;

  const data: {
    label?: string;
    profileCode?: string;
    hasKeyswitch?: boolean;
    color?: string | null;
  } = {};

  if ("color" in body) {
    data.color = sanitizeMarkerColor(body.color);
  }

  if (label !== undefined) {
    if (!label) {
      return NextResponse.json({ error: "Label wajib" }, { status: 400 });
    }
    data.label = label;
  }

  const changingProfile =
    profileCode !== undefined || hasKeyswitchRaw !== undefined;

  if (changingProfile) {
    const nextProfile = isDoorProfileCode(profileCode)
      ? profileCode
      : marker.profileCode && isDoorProfileCode(marker.profileCode)
        ? marker.profileCode
        : null;

    if (!nextProfile) {
      return NextResponse.json(
        { error: "Profil pintu tidak valid" },
        { status: 400 }
      );
    }

    const nextKeyswitch =
      profileAllowsKeyswitch(nextProfile) &&
      Boolean(
        hasKeyswitchRaw !== undefined
          ? hasKeyswitchRaw
          : marker.hasKeyswitch
      );

    const profileSame =
      nextProfile === marker.profileCode &&
      nextKeyswitch === marker.hasKeyswitch;
    if (profileSame) {
      if (Object.keys(data).length === 0) {
        return NextResponse.json(
          { error: "Tidak ada perubahan" },
          { status: 400 }
        );
      }
      const updated = await prisma.marker.update({
        where: { id: marker.id },
        data,
        include: {
          items: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        },
      });
      return NextResponse.json(updated);
    }

    const locked = marker.items.some(
      (i) => i.status === "SUBMITTED" || i.progressPct > 0 || i.done
    );
    if (locked) {
      return NextResponse.json(
        {
          error:
            "Tidak bisa ganti profil/checklist: ada item yang sudah disubmit atau di-approve",
        },
        { status: 400 }
      );
    }

    const checklist = buildChecklistItems(nextProfile, nextKeyswitch);

    await prisma.$transaction(async (tx) => {
      await tx.breakdownItem.deleteMany({ where: { markerId: marker.id } });
      await tx.marker.update({
        where: { id: marker.id },
        data: {
          ...data,
          profileCode: nextProfile,
          hasKeyswitch: nextKeyswitch,
          items: {
            create: checklist.map((c, i) => ({
              name: c.name,
              bobot: c.bobot,
              sortOrder: i,
            })),
          },
        },
      });
    });

    const updated = await prisma.marker.findUnique({
      where: { id: marker.id },
      include: { items: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    });
    return NextResponse.json(updated);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 });
  }

  const updated = await prisma.marker.update({
    where: { id: marker.id },
    data,
    include: { items: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });
  return NextResponse.json(updated);
}

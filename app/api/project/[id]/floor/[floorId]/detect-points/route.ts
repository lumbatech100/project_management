import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import {
  detectPlotPointsFromBuffer,
  sanitizeMarkerColor,
  PLOT_NEAR,
} from "@/lib/detect-plot-points";
import { computeMarkerPaints } from "@/lib/paint-marker-colors";
import { prisma } from "@/lib/prisma";
import { parsePlotRegion, pointInRegion } from "@/lib/plot-region";
import { canManageDrawing } from "@/lib/utils";
import {
  buildChecklistItems,
  isDoorProfileCode,
  profileAllowsKeyswitch,
} from "@/lib/door-profiles";

type Params = { params: Promise<{ id: string; floorId: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
const NEAR_EXISTING = PLOT_NEAR;
const MAX_APPLY = 300;

function filenameFromUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("/api/uploads/")) return url.slice("/api/uploads/".length);
  if (url.startsWith("/uploads/")) return url.slice("/uploads/".length);
  return null;
}

async function readDrawingBuffer(urls: Array<string | null | undefined>) {
  for (const url of urls) {
    const name = filenameFromUrl(url);
    if (!name) continue;
    try {
      return await readFile(path.join(UPLOADS_DIR, name));
    } catch {
      continue;
    }
  }
  return null;
}

function nearbyMarker<T extends { id: string; x: number; y: number }>(
  x: number,
  y: number,
  markers: T[]
): T | undefined {
  let best: T | undefined;
  let bestD = NEAR_EXISTING;
  for (const m of markers) {
    const d = Math.hypot(m.x - x, m.y - y);
    if (d < bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

function nearExisting(
  x: number,
  y: number,
  markers: { x: number; y: number }[]
) {
  return markers.some((m) => Math.hypot(m.x - x, m.y - y) < NEAR_EXISTING);
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nextIndex(labels: string[], prefix: string) {
  const re = new RegExp(`^${escapeRe(prefix)}\\s*(\\d+)$`, "i");
  let max = 0;
  for (const label of labels) {
    const m = label.trim().match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export async function GET(req: NextRequest, props: Params) {
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
    include: {
      markers: { select: { id: true, x: true, y: true, label: true, color: true } },
    },
  });
  if (!floor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buf = await readDrawingBuffer([floor.drawingUrl, floor.drawingHiUrl]);
  if (!buf) {
    return NextResponse.json(
      { error: "Drawing belum di-upload atau file tidak ditemukan" },
      { status: 400 }
    );
  }

  try {
    const region = parsePlotRegion(floor.plotRegion);
    const { points, width, height } = await detectPlotPointsFromBuffer(
      buf,
      region
    );
    const tagged = points.map((p) => ({
      ...p,
      markerId: nearbyMarker(p.x, p.y, floor.markers)?.id ?? null,
    }));
    const existingCount = tagged.filter((p) => p.markerId).length;

    const paints = await computeMarkerPaints(buf, floor.markers);
    if (paints.length > 0) {
      await prisma.$transaction(
        paints.map((u) =>
          prisma.marker.update({
            where: { id: u.id },
            data: { color: u.color },
          })
        )
      );
    }

    return NextResponse.json({
      points: tagged,
      skippedExisting: existingCount,
      painted: paints,
      region,
      width,
      height,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Gagal mendeteksi titik",
      },
      { status: 422 }
    );
  }
}

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
    include: { markers: { select: { x: true, y: true, label: true } } },
  });
  if (!floor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { points, prefix, profileCode, hasKeyswitch } = body as {
    points?: { x: number; y: number; label?: string; color?: string }[];
    prefix?: string;
    profileCode?: string;
    hasKeyswitch?: boolean;
  };

  if (!Array.isArray(points) || points.length === 0) {
    return NextResponse.json({ error: "Pilih minimal satu titik" }, { status: 400 });
  }
  if (points.length > MAX_APPLY) {
    return NextResponse.json(
      { error: `Maksimal ${MAX_APPLY} titik sekaligus` },
      { status: 400 }
    );
  }
  if (!isDoorProfileCode(profileCode)) {
    return NextResponse.json(
      { error: "Profil pintu wajib dipilih" },
      { status: 400 }
    );
  }

  const region = parsePlotRegion(floor.plotRegion);
  const keyswitch =
    profileAllowsKeyswitch(profileCode) && Boolean(hasKeyswitch);
  const checklist = buildChecklistItems(profileCode, keyswitch);
  const labelPrefix = (typeof prefix === "string" && prefix.trim()) || "Pintu";
  let n = nextIndex(
    floor.markers.map((m) => m.label),
    labelPrefix
  );

  const created = await prisma.$transaction(
    async (tx) => {
      const out = [];
      const existing = floor.markers.map((m) => ({ x: m.x, y: m.y }));
      for (const p of points) {
        if (typeof p.x !== "number" || typeof p.y !== "number") continue;
        const x = Math.min(1, Math.max(0, p.x));
        const y = Math.min(1, Math.max(0, p.y));
        // Titik di luar area plot (legend, judul, dll) tidak boleh diplot.
        if (!pointInRegion(x, y, region)) continue;
        if (nearExisting(x, y, existing)) continue;
        const label =
          (typeof p.label === "string" && p.label.trim()) ||
          `${labelPrefix} ${n++}`;
        const marker = await tx.marker.create({
          data: {
            floorId: params.floorId,
            label,
            x,
            y,
            profileCode,
            hasKeyswitch: keyswitch,
            color: sanitizeMarkerColor(p.color),
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
        out.push(marker);
      }
      return out;
    },
    { timeout: 120_000 }
  );

  return NextResponse.json(
    {
      markers: created,
      count: created.length,
      skipped: points.length - created.length,
    },
    { status: 201 }
  );
}

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

  const floor = await prisma.floor.findFirst({
    where: { id: params.floorId, projectId: params.id },
    include: { markers: { select: { id: true, x: true, y: true } } },
  });
  if (!floor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const points = Array.isArray(body.points) ? body.points : [];
  if (points.length === 0) {
    return NextResponse.json({ error: "Pilih minimal satu titik" }, { status: 400 });
  }

  const ids = new Set<string>();
  for (const p of points as {
    x?: number;
    y?: number;
    markerId?: string | null;
  }[]) {
    if (p.markerId && floor.markers.some((m) => m.id === p.markerId)) {
      ids.add(p.markerId);
      continue;
    }
    if (typeof p.x !== "number" || typeof p.y !== "number") continue;
    const hit = nearbyMarker(p.x, p.y, floor.markers);
    if (hit) ids.add(hit.id);
  }

  if (ids.size === 0) {
    return NextResponse.json(
      { error: "Tidak ada plot yang cocok dengan filter" },
      { status: 400 }
    );
  }

  const markers = await prisma.marker.findMany({
    where: { id: { in: Array.from(ids) }, floorId: params.floorId },
    include: { items: { select: { status: true, progressPct: true, done: true } } },
  });

  const deletable: string[] = [];
  let skippedLocked = 0;
  for (const m of markers) {
    const locked = m.items.some(
      (i) => i.status === "SUBMITTED" || i.progressPct > 0 || i.done
    );
    if (locked) skippedLocked += 1;
    else deletable.push(m.id);
  }

  if (deletable.length > 0) {
    await prisma.marker.deleteMany({ where: { id: { in: deletable } } });
  }

  return NextResponse.json({
    deletedIds: deletable,
    count: deletable.length,
    skippedLocked,
  });
}

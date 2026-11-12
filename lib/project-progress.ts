import { prisma } from "@/lib/prisma";

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

type Row = {
  projectId: string;
  floorId: string;
  markerId: string | null;
  total: number | null;
  done: number | null;
};

/**
 * Hitung progress project lewat agregasi SQL (1 baris per titik, bukan per item).
 * Hasil identik dengan calcProjectProgress() di lib/utils.ts, tapi jauh lebih ringan
 * untuk project dengan puluhan ribu breakdown item.
 */
export async function getProjectsProgress(
  projectIds: string[],
  db: Pick<typeof prisma, "$queryRaw"> = prisma
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (projectIds.length === 0) return out;

  const rows = await db.$queryRaw<Row[]>`
    SELECT f."projectId" AS "projectId",
           f."id" AS "floorId",
           m."id" AS "markerId",
           COALESCE(SUM(i."bobot"), 0)::float8 AS "total",
           COALESCE(SUM(i."bobot" * LEAST(100, GREATEST(0, i."progressPct")) / 100.0), 0)::float8 AS "done"
    FROM "Floor" f
    LEFT JOIN "Marker" m ON m."floorId" = f."id"
    LEFT JOIN "BreakdownItem" i ON i."markerId" = m."id"
    WHERE f."projectId" = ANY(${projectIds})
    GROUP BY f."projectId", f."id", m."id"
  `;

  // projectId -> floorId -> progress tiap marker
  const tree = new Map<string, Map<string, number[]>>();
  for (const r of rows) {
    let floors = tree.get(r.projectId);
    if (!floors) tree.set(r.projectId, (floors = new Map()));
    let markers = floors.get(r.floorId);
    if (!markers) floors.set(r.floorId, (markers = []));
    if (r.markerId === null) continue; // lantai tanpa titik
    const total = r.total ?? 0;
    markers.push(total === 0 ? 0 : round1(((r.done ?? 0) / total) * 100));
  }

  for (const id of projectIds) {
    const floors = tree.get(id);
    if (!floors || floors.size === 0) {
      out.set(id, 0);
      continue;
    }
    let sum = 0;
    for (const markers of floors.values()) {
      sum +=
        markers.length === 0
          ? 0
          : round1(markers.reduce((s, p) => s + p, 0) / markers.length);
    }
    out.set(id, round1(sum / floors.size));
  }
  return out;
}

export async function getProjectProgress(projectId: string): Promise<number> {
  return (await getProjectsProgress([projectId])).get(projectId) ?? 0;
}

import type { PoLineType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calcProjectProgress } from "@/lib/utils";

/** Line jasa instalasi mengikuti progress lapangan (bukan input manual). */
export function isFieldProgressLine(type: PoLineType | string) {
  return type === "JASA_INSTALASI";
}

/**
 * Progress lapangan project = rata-rata progress lantai, dari breakdown item
 * yang sudah di-approve SM (`progressPct`; submit Leader ada di `submittedPct`).
 */
export async function projectFieldProgress(projectId: string): Promise<number> {
  const floors = await prisma.floor.findMany({
    where: { projectId },
    select: {
      markers: {
        select: {
          items: { select: { bobot: true, progressPct: true, done: true } },
        },
      },
    },
  });
  return calcProjectProgress(floors);
}

/** Ganti % line jasa instalasi dengan progress lapangan saat data PO dibaca. */
export async function applyFieldProgress<
  L extends { type: PoLineType | string; progressPct: number },
  P extends { lines: L[] },
>(projectId: string, pos: P[]): Promise<P[]> {
  if (!pos.some((po) => po.lines.some((l) => isFieldProgressLine(l.type)))) {
    return pos;
  }
  const field = await projectFieldProgress(projectId);
  return pos.map((po) => ({
    ...po,
    lines: po.lines.map((l) =>
      isFieldProgressLine(l.type) ? { ...l, progressPct: field } : l
    ),
  }));
}

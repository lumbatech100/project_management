import type { Prisma } from "@prisma/client";

/** Field yang cukup untuk menghitung progress (sidebar, ringkasan). */
export const PROGRESS_CALC_ITEM_SELECT = {
  bobot: true,
  done: true,
  progressPct: true,
} satisfies Prisma.BreakdownItemSelect;

/** Field item yang dipakai halaman Progress (FloorView). */
export const FLOOR_VIEW_ITEM_SELECT = {
  id: true,
  name: true,
  bobot: true,
  status: true,
  done: true,
  progressPct: true,
  submittedPct: true,
  doneAt: true,
  doneBy: true,
  submittedAt: true,
  submittedBy: true,
  approvedAt: true,
  approvedBy: true,
  photoUrls: true,
} satisfies Prisma.BreakdownItemSelect;

type Compact<T> = { [K in keyof T]: Exclude<T[K], null> };

/**
 * Buang field null / array kosong sebelum dikirim ke client component.
 * Ribuan item × field kosong membengkakkan payload RSC berkali lipat.
 */
export function compactItem<T extends Record<string, unknown>>(item: T): Compact<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    if (v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as Compact<T>;
}

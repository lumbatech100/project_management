import type { PoLineType } from "@prisma/client";

export type PoDeliveryLike = { qty: number };

export type PoLineLike = {
  type: PoLineType | string;
  qty: number;
  bobotPct: number;
  progressPct: number;
  deliveries?: PoDeliveryLike[];
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function clampPct(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Qty barang yang sudah diterima client */
export function deliveredQty(line: PoLineLike): number {
  if (!line.deliveries?.length) return 0;
  return line.deliveries.reduce((s, d) => s + (d.qty || 0), 0);
}

/**
 * % selesai 1 line:
 * - BARANG: qty diterima / qty PO (cap 100)
 * - JASA_*: progressPct manual
 */
export function calcLineProgressPct(line: PoLineLike): number {
  if (line.type === "BARANG") {
    const target = line.qty > 0 ? line.qty : 0;
    if (target <= 0) return 0;
    return clampPct(round1((deliveredQty(line) / target) * 100));
  }
  return clampPct(round1(line.progressPct || 0));
}

/** Progress PO = Σ (bobot × % line) / Σ bobot */
export function calcPoProgress(lines: PoLineLike[]): number {
  if (!lines.length) return 0;
  const totalBobot = lines.reduce((s, l) => s + (l.bobotPct || 0), 0);
  if (totalBobot <= 0) return 0;
  const earned = lines.reduce(
    (s, l) => s + (l.bobotPct || 0) * (calcLineProgressPct(l) / 100),
    0
  );
  return round1((earned / totalBobot) * 100);
}

export function sumBobot(lines: { bobotPct: number }[]): number {
  return round1(lines.reduce((s, l) => s + (l.bobotPct || 0), 0));
}

/** Bobot 1 unit (%). Pakai nilai tersimpan, atau bobot line / qty. */
export function resolveBobotUnitPct(opts: {
  bobotUnitPct?: number | null;
  bobotPct: number;
  qty: number;
}): number | null {
  if (
    opts.bobotUnitPct != null &&
    !Number.isNaN(opts.bobotUnitPct) &&
    opts.bobotUnitPct >= 0
  ) {
    return opts.bobotUnitPct;
  }
  if (opts.qty > 0 && opts.bobotPct >= 0) {
    // keep more decimals for tiny unit weights (Kurva S ~0.04686%)
    return Math.round((opts.bobotPct / opts.qty) * 1e6) / 1e6;
  }
  return null;
}

/** Parse bobot unit dari body; null = hitung dari bobotPct/qty. Throw Error jika invalid. */
export function parseBobotUnitPct(
  raw: unknown,
  bobotPct: number,
  qty: number
): number | null {
  if (raw !== undefined && raw !== null && raw !== "") {
    const v = parseFloat(String(raw));
    if (Number.isNaN(v) || v < 0) {
      throw new Error("Bobot per unit tidak valid");
    }
    return v;
  }
  return resolveBobotUnitPct({ bobotPct, qty });
}


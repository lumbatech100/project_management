/** Area denah (skala 0–1 terhadap gambar) tempat deteksi titik boleh bekerja. */
export type PlotRegion = { x: number; y: number; w: number; h: number };

export const MIN_REGION_SIZE = 0.03;

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/** Validasi + normalisasi nilai dari DB / request. Null kalau tidak valid. */
export function parsePlotRegion(value: unknown): PlotRegion | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const { x, y, w, h } = v;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof w !== "number" ||
    typeof h !== "number" ||
    ![x, y, w, h].every(Number.isFinite)
  ) {
    return null;
  }
  const x0 = clamp01(x);
  const y0 = clamp01(y);
  const x1 = clamp01(x + w);
  const y1 = clamp01(y + h);
  if (x1 - x0 < MIN_REGION_SIZE || y1 - y0 < MIN_REGION_SIZE) return null;
  return {
    x: Number(x0.toFixed(5)),
    y: Number(y0.toFixed(5)),
    w: Number((x1 - x0).toFixed(5)),
    h: Number((y1 - y0).toFixed(5)),
  };
}

export function pointInRegion(
  x: number,
  y: number,
  region: PlotRegion | null | undefined
) {
  if (!region) return true;
  return (
    x >= region.x &&
    x <= region.x + region.w &&
    y >= region.y &&
    y <= region.y + region.h
  );
}

/** Normalisasi dua titik sembarang (drag ke segala arah) jadi region. */
export function regionFromCorners(
  ax: number,
  ay: number,
  bx: number,
  by: number
): PlotRegion {
  const x0 = clamp01(Math.min(ax, bx));
  const y0 = clamp01(Math.min(ay, by));
  const x1 = clamp01(Math.max(ax, bx));
  const y1 = clamp01(Math.max(ay, by));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

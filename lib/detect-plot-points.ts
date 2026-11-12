import sharp from "sharp";
import { pointInRegion, type PlotRegion } from "@/lib/plot-region";

export type DetectedPlotPoint = {
  id: string;
  x: number;
  y: number;
  color: string;
  family: string;
  area: number;
};

export { sanitizeMarkerColor } from "@/lib/marker-color";

const DETECT_MAX_EDGE = 2000;
const MAX_CANDIDATES = 90_000;
const MAX_POINTS = 800;
const MIN_AREA = 22;
const MAX_AREA = 280;
const MAX_BBOX = 20;
const MERGE_PX = 7;
/** Batas atas fill-span (lubang ditutup). Bulatan ≈0.7–0.85, persegi ≥0.89 (JPEG/resize melembutkan sudut). */
const MAX_SPAN_FILL = 0.88;
const MIN_SPAN_CHECK_PX = 12;
/** Saturasi minimum. Titik hijau/biru pucat di CAD ~0.33–0.45. */
const SAT_MIN = 0.28;
const SAT_MIN_STRICT = 0.42;
/** Jarak 0–1: dua titik deteksi dianggap sama (setara merge di gambar). */
export const PLOT_NEAR = MERGE_PX / DETECT_MAX_EDGE;

type Hsv = { h: number; s: number; v: number };

function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hueFamily(h: number): string {
  if (h < 15 || h >= 345) return "Merah";
  if (h < 40) return "Oranye";
  if (h < 70) return "Kuning";
  if (h < 160) return "Hijau";
  if (h < 200) return "Cyan";
  if (h < 255) return "Biru";
  if (h < 300) return "Ungu";
  return "Pink";
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Selisih kanal RGB minimum (0–255): buang abu-abu / noise JPEG yang saturasinya palsu. */
const MIN_CHROMA = 38;

function isColoredDot(r: number, g: number, b: number, satMin: number): boolean {
  if (Math.max(r, g, b) - Math.min(r, g, b) < MIN_CHROMA) return false;
  const { s, v } = rgbToHsv(r, g, b);
  if (s < satMin) return false;
  if (v < 0.2 || v > 0.985) return false;
  if (v < 0.32 && s < 0.5) return false;
  return true;
}

type Blob = {
  sumX: number;
  sumY: number;
  sumX2: number;
  sumY2: number;
  sumR: number;
  sumG: number;
  sumB: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Luas bentuk dengan lubang ditutup (jumlah span kiri–kanan tiap baris). 0 = tidak dihitung. */
  spanArea: number;
  /** Indeks piksel blob (hanya disimpan untuk blob yang mungkin gabungan beberapa titik). */
  pixels?: number[];
};

type Bounds = { x0: number; y0: number; x1: number; y1: number };

/** Blob lebih besar dari ini tidak dicoba dipecah. */
const SPLIT_MAX_AREA = 760;
/** Hasil pemulihan lebih kecil dari ini dianggap serpihan (mis. potongan garis putus), bukan titik. */
const RECOVER_MIN_AREA = 45;

function blobFromPixels(pixels: number[], data: Buffer, width: number): Blob {
  const blob: Blob = {
    sumX: 0,
    sumY: 0,
    sumX2: 0,
    sumY2: 0,
    sumR: 0,
    sumG: 0,
    sumB: 0,
    area: pixels.length,
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    spanArea: 0,
  };
  for (const idx of pixels) {
    const x = idx % width;
    const y = (idx - x) / width;
    const o = idx * 3;
    blob.sumX += x;
    blob.sumY += y;
    blob.sumX2 += x * x;
    blob.sumY2 += y * y;
    blob.sumR += data[o]!;
    blob.sumG += data[o + 1]!;
    blob.sumB += data[o + 2]!;
    if (x < blob.minX) blob.minX = x;
    if (y < blob.minY) blob.minY = y;
    if (x > blob.maxX) blob.maxX = x;
    if (y > blob.maxY) blob.maxY = y;
  }
  // Hanya blob kecil (kandidat titik) yang perlu dihitung span-nya.
  if (blob.area <= MAX_AREA) {
    const rows = blob.maxY - blob.minY + 1;
    const rowMin = new Array<number>(rows).fill(Infinity);
    const rowMax = new Array<number>(rows).fill(-Infinity);
    for (const idx of pixels) {
      const x = idx % width;
      const r = (idx - x) / width - blob.minY;
      if (x < rowMin[r]!) rowMin[r] = x;
      if (x > rowMax[r]!) rowMax[r] = x;
    }
    let span = 0;
    for (let r = 0; r < rows; r++) {
      if (rowMax[r]! >= rowMin[r]!) span += rowMax[r]! - rowMin[r]! + 1;
    }
    blob.spanArea = span;
  }
  return blob;
}

function collectBlobs(
  data: Buffer,
  width: number,
  height: number,
  satMin: number,
  bounds: Bounds
): { blobs: Blob[]; candidates: number } {
  const n = width * height;
  const mask = new Uint8Array(n);
  let candidates = 0;
  // Hanya piksel di dalam bounds yang dipindai (area denah).
  for (let y = bounds.y0; y <= bounds.y1; y++) {
    for (let x = bounds.x0; x <= bounds.x1; x++) {
      const i = y * width + x;
      const o = i * 3;
      if (isColoredDot(data[o]!, data[o + 1]!, data[o + 2]!, satMin)) {
        mask[i] = 1;
        candidates++;
      }
    }
  }
  if (candidates === 0 || candidates > MAX_CANDIDATES) {
    return { blobs: [], candidates };
  }

  const visited = new Uint8Array(n);
  const blobs: Blob[] = [];
  const stack: number[] = [];

  for (let start = 0; start < n; start++) {
    if (!mask[start] || visited[start]) continue;
    const pixels: number[] = [];
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;

    while (stack.length) {
      const idx = stack.pop()!;
      pixels.push(idx);
      const x = idx % width;
      const y = (idx - x) / width;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (!mask[ni] || visited[ni]) continue;
          visited[ni] = 1;
          stack.push(ni);
        }
      }
    }
    const blob = blobFromPixels(pixels, data, width);
    if (blob.area <= SPLIT_MAX_AREA) blob.pixels = pixels;
    blobs.push(blob);
  }

  return { blobs, candidates };
}

function blobOk(b: Blob): boolean {
  if (b.area < MIN_AREA || b.area > MAX_AREA) return false;
  const bw = b.maxX - b.minX + 1;
  const bh = b.maxY - b.minY + 1;
  if (bw > MAX_BBOX || bh > MAX_BBOX) return false;
  const aspect = bw >= bh ? bw / bh : bh / bw;
  if (aspect > 1.45) return false;
  const fill = b.area / (bw * bh);
  if (fill < 0.42 || fill > 0.94) return false;
  // Persegi/kotak (mis. simbol dengan huruf di dalamnya) tetap "penuh" per baris
  // walau berlubang; bulatan ~0.785 karena barisnya memendek ke ujung.
  // Blob sangat kecil terlalu kasar (piksel) untuk dibedakan bulat/kotak, jadi dilewati.
  if (
    b.spanArea > 0 &&
    Math.min(bw, bh) >= MIN_SPAN_CHECK_PX &&
    b.spanArea / (bw * bh) > MAX_SPAN_FILL
  ) {
    return false;
  }
  const cx = b.sumX / b.area;
  const cy = b.sumY / b.area;
  const varX = b.sumX2 / b.area - cx * cx;
  const varY = b.sumY2 / b.area - cy * cy;
  const vmax = Math.max(varX, varY, 1e-6);
  const vmin = Math.min(varX, varY);
  if (vmin / vmax < 0.42) return false;
  const r = Math.max(bw, bh) / 2;
  if (b.area / (Math.PI * r * r) < 0.42) return false;
  return true;
}

/**
 * Dua/tiga titik sewarna yang bertumpuk jadi satu gumpalan. Bagi dengan k-means
 * kalau luasnya kira-kira kelipatan luas titik normal, dan semua hasil bagi
 * lolos filter bentuk titik (kalau tidak, gumpalan dibiarkan ditolak).
 */
function splitMergedBlob(
  b: Blob,
  refArea: number,
  data: Buffer,
  width: number
): Blob[] {
  const px = b.pixels;
  if (!px || b.area <= MIN_AREA) return [];
  const ratio = b.area / refArea;
  const k = ratio >= 1.45 && ratio < 2.45 ? 2 : ratio >= 2.45 && ratio < 3.45 ? 3 : 0;
  if (k === 0) return [];
  const bw = b.maxX - b.minX + 1;
  const bh = b.maxY - b.minY + 1;
  if (Math.max(bw, bh) > MAX_BBOX * 2.2) return [];
  if (b.area / (bw * bh) < 0.4) return [];

  const xs = px.map((i) => i % width);
  const ys = px.map((i, j) => (i - xs[j]!) / width);
  const mx = b.sumX / b.area;
  const my = b.sumY / b.area;
  const centers: Array<[number, number]> = [];
  const farthest = () => {
    let best = 0;
    let bestD = -1;
    for (let j = 0; j < px.length; j++) {
      let d = Infinity;
      if (centers.length === 0) d = Math.hypot(xs[j]! - mx, ys[j]! - my);
      else for (const c of centers) d = Math.min(d, Math.hypot(xs[j]! - c[0], ys[j]! - c[1]));
      if (d > bestD) {
        bestD = d;
        best = j;
      }
    }
    centers.push([xs[best]!, ys[best]!]);
  };
  for (let c = 0; c < k; c++) farthest();

  const assign = new Int8Array(px.length);
  for (let iter = 0; iter < 15; iter++) {
    const sx = new Array<number>(k).fill(0);
    const sy = new Array<number>(k).fill(0);
    const cnt = new Array<number>(k).fill(0);
    for (let j = 0; j < px.length; j++) {
      let bi = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (xs[j]! - centers[c]![0]) ** 2 + (ys[j]! - centers[c]![1]) ** 2;
        if (d < bd) {
          bd = d;
          bi = c;
        }
      }
      assign[j] = bi;
      sx[bi]! += xs[j]!;
      sy[bi]! += ys[j]!;
      cnt[bi]! += 1;
    }
    for (let c = 0; c < k; c++) {
      if (cnt[c]! > 0) centers[c] = [sx[c]! / cnt[c]!, sy[c]! / cnt[c]!];
    }
  }

  const parts: Blob[] = [];
  for (let c = 0; c < k; c++) {
    const group = px.filter((_, j) => assign[j] === c);
    if (group.length === 0) return [];
    parts.push(blobFromPixels(group, data, width));
  }
  return parts.every(blobOk) ? parts : [];
}

function pixelHue(idx: number, data: Buffer) {
  const o = idx * 3;
  return rgbToHsv(data[o]!, data[o + 1]!, data[o + 2]!).h;
}

/**
 * Pulihkan titik dari gumpalan yang ditolak: (1) pisahkan per keluarga warna
 * (titik kuning yang menempel di titik biru), lalu (2) bagi titik sewarna yang
 * bertumpuk. Setiap hasil tetap harus lolos filter bentuk titik.
 */
function recoverBlob(
  b: Blob,
  refArea: number,
  data: Buffer,
  width: number
): Blob[] {
  const px = b.pixels;
  if (!px) return [];
  const byFamily = new Map<string, number[]>();
  for (const idx of px) {
    const fam = hueFamily(pixelHue(idx, data));
    const list = byFamily.get(fam);
    if (list) list.push(idx);
    else byFamily.set(fam, [idx]);
  }
  const groups = [...byFamily.values()].filter((g) => g.length >= MIN_AREA);
  const parts: Blob[] =
    groups.length > 1
      ? groups.map((g) => {
          const part = blobFromPixels(g, data, width);
          part.pixels = g;
          return part;
        })
      : [b];
  const out: Blob[] = [];
  for (const part of parts) {
    if (blobOk(part)) out.push(part);
    else out.push(...splitMergedBlob(part, refArea, data, width));
  }
  return out.filter((p) => p.area >= RECOVER_MIN_AREA);
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
}

function looksLikeDash(p: { area: number; aspect?: number }) {
  return p.area < 55 || (p.aspect ?? 1) > 1.28;
}

function colorDist(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number }
) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function spanOf(
  idxs: number[],
  points: Array<{ xPx: number; yPx: number }>,
  axis: "x" | "y"
) {
  let min = Infinity;
  let max = -Infinity;
  for (const i of idxs) {
    const v = axis === "x" ? points[i]!.xPx : points[i]!.yPx;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}

function gapsRegular(values: number[]) {
  if (values.length < 4) return false;
  const sorted = [...values].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i]! - sorted[i - 1]!);
  const mid = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;
  if (mid < 6 || mid > 90) return false;
  const ok = gaps.filter(
    (g) => Math.abs(g - mid) < mid * 0.55 || Math.abs(g - 2 * mid) < mid * 0.55
  ).length;
  return ok / gaps.length >= 0.55;
}

/** Buang dash/garis putus: rantai blob sewarna yang lurus dan beraturan. */
function rejectLinearDashes(
  points: Array<{
    xPx: number;
    yPx: number;
    r: number;
    g: number;
    b: number;
    area: number;
    aspect?: number;
  }>
) {
  const drop = new Set<number>();
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const horiz: number[] = [i];
    const vert: number[] = [i];
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const o = points[j]!;
      if (colorDist(a, o) > 85) continue;
      if (Math.abs(o.yPx - a.yPx) <= 3.5) horiz.push(j);
      if (Math.abs(o.xPx - a.xPx) <= 3.5) vert.push(j);
    }
    if (
      horiz.length >= 5 &&
      spanOf(horiz, points, "x") > 180 &&
      gapsRegular(horiz.map((k) => points[k]!.xPx))
    ) {
      for (const k of horiz) {
        if (looksLikeDash(points[k]!)) drop.add(k);
      }
    }
    if (
      vert.length >= 5 &&
      spanOf(vert, points, "y") > 180 &&
      gapsRegular(vert.map((k) => points[k]!.yPx))
    ) {
      for (const k of vert) {
        if (looksLikeDash(points[k]!)) drop.add(k);
      }
    }
  }
  return points.filter((_, i) => !drop.has(i));
}

function mergeNearby(
  points: Array<{
    xPx: number;
    yPx: number;
    r: number;
    g: number;
    b: number;
    area: number;
    aspect?: number;
  }>
) {
  const used = new Set<number>();
  const out: typeof points = [];
  for (let i = 0; i < points.length; i++) {
    if (used.has(i)) continue;
    let best = points[i]!;
    for (let j = i + 1; j < points.length; j++) {
      if (used.has(j)) continue;
      const other = points[j]!;
      if (Math.hypot(best.xPx - other.xPx, best.yPx - other.yPx) <= MERGE_PX) {
        used.add(j);
        if (other.area > best.area) best = other;
      }
    }
    out.push(best);
  }
  return out;
}

export async function detectPlotPointsFromBuffer(
  input: Buffer,
  region?: PlotRegion | null
): Promise<{ points: DetectedPlotPoint[]; width: number; height: number }> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({
      width: DETECT_MAX_EDGE,
      height: DETECT_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  // Pindai area + margin sebesar blob maksimum supaya titik di tepi area tidak
  // terpotong; hasil akhir tetap difilter berdasarkan titik pusatnya.
  const bounds: Bounds = region
    ? {
        x0: Math.max(0, Math.floor(region.x * (width - 1)) - MAX_BBOX),
        y0: Math.max(0, Math.floor(region.y * (height - 1)) - MAX_BBOX),
        x1: Math.min(
          width - 1,
          Math.ceil((region.x + region.w) * (width - 1)) + MAX_BBOX
        ),
        y1: Math.min(
          height - 1,
          Math.ceil((region.y + region.h) * (height - 1)) + MAX_BBOX
        ),
      }
    : { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };

  let { blobs, candidates } = collectBlobs(data, width, height, SAT_MIN, bounds);
  if (candidates > MAX_CANDIDATES) {
    ({ blobs, candidates } = collectBlobs(data, width, height, SAT_MIN_STRICT, bounds));
  }
  if (candidates > MAX_CANDIDATES) {
    throw new Error(
      "Gambar terlalu ramai warna — deteksi otomatis tidak akurat. Plot manual saja."
    );
  }

  const okBlobs = blobs.filter(blobOk);
  const refArea = median(okBlobs.filter((b) => b.area >= 100).map((b) => b.area));
  const recovered =
    okBlobs.length >= 8 && refArea > 0
      ? blobs
          .filter((b) => !blobOk(b))
          .flatMap((b) => recoverBlob(b, refArea, data, width))
      : [];

  const raw = [...okBlobs, ...recovered].map((b) => {
    const bw = b.maxX - b.minX + 1;
    const bh = b.maxY - b.minY + 1;
    return {
      xPx: b.sumX / b.area,
      yPx: b.sumY / b.area,
      r: b.sumR / b.area,
      g: b.sumG / b.area,
      b: b.sumB / b.area,
      area: b.area,
      aspect: bw >= bh ? bw / bh : bh / bw,
    };
  });
  const inside = region
    ? raw.filter((p) =>
        pointInRegion(
          p.xPx / (width - 1 || 1),
          p.yPx / (height - 1 || 1),
          region
        )
      )
    : raw;
  const merged = rejectLinearDashes(mergeNearby(inside)).slice(0, MAX_POINTS);

  const points = merged.map((p, i) => {
    const hsv = rgbToHsv(p.r, p.g, p.b);
    return {
      id: `d${i + 1}`,
      x: Number((p.xPx / (width - 1 || 1)).toFixed(5)),
      y: Number((p.yPx / (height - 1 || 1)).toFixed(5)),
      color: toHex(p.r, p.g, p.b),
      family: hueFamily(hsv.h),
      area: p.area,
    };
  });

  return { points, width, height };
}

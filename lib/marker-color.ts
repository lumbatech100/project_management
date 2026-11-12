export function sanitizeMarkerColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m?.[1]) return null;
  return `#${m[1].toLowerCase()}`;
}

function rgbToHsv(r: number, g: number, b: number) {
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

export const COLOR_FAMILY_SWATCH: Record<string, string> = {
  Merah: "#dc2626",
  Oranye: "#f97316",
  Kuning: "#eab308",
  Hijau: "#22c55e",
  Cyan: "#06b6d4",
  Biru: "#3b82f6",
  Ungu: "#7c3aed",
  Pink: "#ec4899",
  Lainnya: "#94a3b8",
};

export const PLOT_COLOR_CHOICES = (
  [
    "Merah",
    "Oranye",
    "Kuning",
    "Hijau",
    "Cyan",
    "Biru",
    "Ungu",
    "Pink",
  ] as const
).map((family) => ({ family, color: COLOR_FAMILY_SWATCH[family]! }));

export function colorFamilyFromHex(hex: string | null | undefined): string {
  const sanitized = sanitizeMarkerColor(hex);
  if (!sanitized) return "Lainnya";
  const r = parseInt(sanitized.slice(1, 3), 16);
  const g = parseInt(sanitized.slice(3, 5), 16);
  const b = parseInt(sanitized.slice(5, 7), 16);
  return hueFamily(rgbToHsv(r, g, b).h);
}

export type ColorCountRow = {
  family: string;
  count: number;
  color: string;
};

export function countMarkersByColor(
  markers: { color?: string | null }[]
): ColorCountRow[] {
  const map = new Map<string, { count: number; color: string }>();
  for (const m of markers) {
    const family = m.color ? colorFamilyFromHex(m.color) : "Lainnya";
    const prev = map.get(family);
    if (prev) {
      prev.count += 1;
    } else {
      map.set(family, {
        count: 1,
        color: m.color || COLOR_FAMILY_SWATCH[family] || "#94a3b8",
      });
    }
  }
  return Array.from(map.entries())
    .map(([family, v]) => ({ family, count: v.count, color: v.color }))
    .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
}

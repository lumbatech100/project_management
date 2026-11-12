import {
  detectPlotPointsFromBuffer,
  sanitizeMarkerColor,
} from "@/lib/detect-plot-points";

const MATCH_NEAR = 0.02;

const LABEL_COLOR: Record<string, string> = {
  biru: "#3b82f6",
  merah: "#dc2626",
  hijau: "#22c55e",
  pink: "#ec4899",
  ungu: "#7c3aed",
  kuning: "#eab308",
  oranye: "#f97316",
  orange: "#f97316",
  cyan: "#06b6d4",
  emergency: "#dc2626",
  elevator: "#7c3aed",
  lift: "#7c3aed",
};

export function colorFromMarkerLabel(label: string): string | null {
  const token = label.trim().split(/[\s\-_]+/)[0]?.toLowerCase() ?? "";
  return LABEL_COLOR[token] ?? null;
}

export async function computeMarkerPaints(
  drawing: Buffer,
  markers: { id: string; x: number; y: number; label: string; color?: string | null }[]
): Promise<{ id: string; color: string }[]> {
  const { points } = await detectPlotPointsFromBuffer(drawing);
  const used = new Set<number>();
  const updates: { id: string; color: string }[] = [];

  for (const m of markers) {
    let bestI = -1;
    let bestD = MATCH_NEAR;
    for (let i = 0; i < points.length; i++) {
      if (used.has(i)) continue;
      const p = points[i]!;
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }

    let color: string | null = null;
    if (bestI >= 0) {
      used.add(bestI);
      color = sanitizeMarkerColor(points[bestI]!.color);
    }
    if (!color) color = colorFromMarkerLabel(m.label);
    if (color && color !== m.color) updates.push({ id: m.id, color });
  }

  return updates;
}

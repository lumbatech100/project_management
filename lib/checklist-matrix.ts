import { calcFloorProgress, calcMarkerProgress } from "@/lib/utils";
import { REKAP_CHECKLIST_COLUMNS, profileLabel } from "@/lib/door-profiles";

export interface ChecklistItemInput {
  name: string;
  bobot: number;
  status?: "OPEN" | "SUBMITTED" | "APPROVED";
  done: boolean;
  progressPct?: number;
  /** YYYY-MM-DD aktivitas terakhir (WIB) — untuk warnai hijau vs hitam */
  activityDate?: string | null;
}

export interface ChecklistFloorInput {
  id: string;
  name: string;
  markers: {
    id: string;
    label: string;
    profileCode?: string | null;
    hasKeyswitch?: boolean;
    items: ChecklistItemInput[];
  }[];
}

/** null = belum mulai (kosong) */
export type CellValue =
  | { kind: "done"; today: boolean }
  | { kind: "pct"; value: number; today: boolean }
  | { kind: "na" }
  | null;

export type MarkerTone = "done" | "running" | "idle";

export interface ChecklistRow {
  markerId: string;
  floorId: string;
  floorName: string;
  markerLabel: string;
  profile: string;
  markerPct: number;
  tone: MarkerTone;
  /** Sejajar dengan `columns` */
  cells: CellValue[];
}

export interface ChecklistMatrix {
  columns: string[];
  floors: { id: string; name: string; progress: number }[];
  projectPct: number;
  rows: ChecklistRow[];
}

function itemDone(item: ChecklistItemInput) {
  return (
    item.done ||
    item.status === "APPROVED" ||
    (item.progressPct ?? 0) >= 100
  );
}

function itemPct(item: ChecklistItemInput) {
  if (typeof item.progressPct === "number") return item.progressPct;
  return itemDone(item) ? 100 : 0;
}

export function markerTone(pct: number): MarkerTone {
  if (pct >= 100) return "done";
  if (pct > 0) return "running";
  return "idle";
}

function cellFromItem(
  item: ChecklistItemInput | undefined,
  todayKey: string
): CellValue {
  if (!item) return { kind: "na" };
  const today = !!item.activityDate && item.activityDate === todayKey;
  if (itemDone(item)) return { kind: "done", today };
  const pct = itemPct(item);
  if (pct > 0) return { kind: "pct", value: pct, today };
  return null;
}

export function cellDisplay(cell: CellValue): string {
  if (cell?.kind === "done") return "✓";
  if (cell?.kind === "pct") return `${cell.value}%`;
  return "";
}

export function buildChecklistMatrix(
  floors: ChecklistFloorInput[],
  todayKey: string
): ChecklistMatrix {
  const names = new Set<string>();
  for (const f of floors) {
    for (const m of f.markers) {
      for (const item of m.items) names.add(item.name);
    }
  }
  const ordered = REKAP_CHECKLIST_COLUMNS.filter((c) => names.has(c));
  const extras = Array.from(names)
    .filter((n) => !REKAP_CHECKLIST_COLUMNS.includes(n))
    .sort((a, b) => a.localeCompare(b, "id"));
  const columns =
    ordered.length === 0 && extras.length === 0
      ? [...REKAP_CHECKLIST_COLUMNS]
      : [...ordered, ...extras];

  const rows: ChecklistRow[] = [];
  for (const floor of floors) {
    for (const m of floor.markers) {
      const markerPct = calcMarkerProgress(m.items);
      const byName = new Map(m.items.map((i) => [i.name, i]));
      rows.push({
        markerId: m.id,
        floorId: floor.id,
        floorName: floor.name,
        markerLabel: m.label,
        profile: `${profileLabel(m.profileCode)}${m.hasKeyswitch ? " · KS" : ""}`,
        markerPct,
        tone: markerTone(markerPct),
        cells: columns.map((col) => cellFromItem(byName.get(col), todayKey)),
      });
    }
  }

  const floorSummaries = floors.map((f) => ({
    id: f.id,
    name: f.name,
    progress: calcFloorProgress(f.markers),
  }));
  const projectPct =
    floorSummaries.length === 0
      ? 0
      : Math.round(
          (floorSummaries.reduce((s, f) => s + f.progress, 0) /
            floorSummaries.length) *
            10
        ) / 10;

  return { columns, floors: floorSummaries, projectPct, rows };
}

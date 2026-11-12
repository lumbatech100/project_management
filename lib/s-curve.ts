import {
  calcFloorProgress,
  calcProjectProgress,
} from "@/lib/utils";

export type SCurveItem = {
  bobot: number;
  done: boolean;
  progressPct?: number | null;
  status?: string | null;
  approvedAt?: string | Date | null;
  doneAt?: string | Date | null;
  submittedAt?: string | Date | null;
};

export type SCurveFloor = {
  id: string;
  name: string;
  plannedStart?: string | Date | null;
  plannedEnd?: string | Date | null;
  markers: { items: SCurveItem[] }[];
};

export type SCurvePoint = {
  date: string; // YYYY-MM-DD
  label: string;
  planned: number | null;
  actual: number | null;
};

function toDateOnly(value: string | Date): Date {
  if (typeof value === "string") {
    // date input / ISO date
    const d = new Date(value.includes("T") ? value : value + "T12:00:00");
    return d;
  }
  return new Date(value);
}

function formatKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatLabel(d: Date): string {
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

/** Planned progress 1 lantai di tanggal asOf (linear 0→100). */
export function plannedFloorProgress(
  plannedStart: string | Date | null | undefined,
  plannedEnd: string | Date | null | undefined,
  asOf: Date
): number | null {
  if (!plannedStart || !plannedEnd) return null;
  const s = startOfDay(toDateOnly(plannedStart)).getTime();
  const e = startOfDay(toDateOnly(plannedEnd)).getTime();
  if (!(e > s)) return null;
  const t = startOfDay(asOf).getTime();
  if (t <= s) return 0;
  if (t >= e) return 100;
  return Math.round(((t - s) / (e - s)) * 1000) / 10;
}

/** Planned project = rata-rata planned lantai yang punya jadwal. */
export function plannedProjectProgress(
  floors: SCurveFloor[],
  asOf: Date
): number | null {
  const values = floors
    .map((f) => plannedFloorProgress(f.plannedStart, f.plannedEnd, asOf))
    .filter((v): v is number => v != null);
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

function itemCompletionDate(item: SCurveItem): Date | null {
  const pct =
    typeof item.progressPct === "number"
      ? item.progressPct
      : item.status === "APPROVED" || item.done
        ? 100
        : 0;
  if (pct <= 0) return null;
  const raw = item.approvedAt || item.doneAt || item.submittedAt;
  if (!raw) return null;
  const d = toDateOnly(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Progress % item yang sudah di-approve paling lambat di akhir hari asOf. */
export function itemProgressPctAsOf(item: SCurveItem, asOf: Date): number {
  const pct =
    typeof item.progressPct === "number"
      ? item.progressPct
      : item.status === "APPROVED" || item.done
        ? 100
        : 0;
  if (pct <= 0) return 0;
  const when = itemCompletionDate(item);
  if (!when) {
    return startOfDay(asOf).getTime() >= startOfDay(new Date()).getTime()
      ? pct
      : 0;
  }
  return when.getTime() <= endOfDay(asOf).getTime() ? pct : 0;
}

/** Apakah item sudah selesai 100% paling lambat di akhir hari asOf. */
export function itemDoneAsOf(item: SCurveItem, asOf: Date): boolean {
  return itemProgressPctAsOf(item, asOf) >= 100;
}

export function actualProjectProgressAsOf(
  floors: SCurveFloor[],
  asOf: Date
): number {
  const shaped = floors.map((f) => ({
    markers: f.markers.map((m) => ({
      items: m.items.map((i) => ({
        bobot: i.bobot,
        done: false,
        progressPct: itemProgressPctAsOf(i, asOf),
      })),
    })),
  }));
  return calcProjectProgress(shaped);
}

function seriesStepDays(totalDays: number): number {
  if (totalDays <= 90) return 1;
  if (totalDays <= 180) return 2;
  if (totalDays <= 365) return 3;
  return 7;
}

/**
 * Bangun titik kurva S Planned vs Actual.
 * Rentang: min plannedStart → max(plannedEnd, today).
 */
export function buildSCurveSeries(
  floors: SCurveFloor[],
  today: Date = new Date()
): {
  points: SCurvePoint[];
  plannedToday: number | null;
  actualToday: number;
  variance: number | null;
  hasSchedule: boolean;
} {
  const todayStart = startOfDay(today);
  const scheduleDates: Date[] = [];

  for (const f of floors) {
    if (f.plannedStart) scheduleDates.push(startOfDay(toDateOnly(f.plannedStart)));
    if (f.plannedEnd) scheduleDates.push(startOfDay(toDateOnly(f.plannedEnd)));
  }

  const hasSchedule = scheduleDates.length >= 1;
  const start = hasSchedule
    ? new Date(Math.min(...scheduleDates.map((d) => d.getTime())))
    : addDays(todayStart, -30);
  let end = hasSchedule
    ? new Date(
        Math.max(
          ...scheduleDates.map((d) => d.getTime()),
          todayStart.getTime()
        )
      )
    : todayStart;

  // Pastikan ada sedikit ruang sebelum start
  if (start.getTime() === end.getTime()) {
    end = addDays(start, 30);
  }

  const totalDays = Math.max(1, daysBetween(start, end));
  const step = seriesStepDays(totalDays);
  const points: SCurvePoint[] = [];

  for (let i = 0; i <= totalDays; i += step) {
    const d = addDays(start, i);
    const planned = plannedProjectProgress(floors, d);
    // Actual hanya sampai hari ini (jangan proyeksi ke masa depan)
    const actual =
      d.getTime() <= todayStart.getTime()
        ? actualProjectProgressAsOf(floors, d)
        : null;
    points.push({
      date: formatKey(d),
      label: formatLabel(d),
      planned,
      actual,
    });
  }

  // Pastikan titik hari ini selalu ada
  const todayKey = formatKey(todayStart);
  if (!points.some((p) => p.date === todayKey)) {
    points.push({
      date: todayKey,
      label: formatLabel(todayStart),
      planned: plannedProjectProgress(floors, todayStart),
      actual: actualProjectProgressAsOf(floors, todayStart),
    });
    points.sort((a, b) => a.date.localeCompare(b.date));
  } else {
    // refresh today actual
    const idx = points.findIndex((p) => p.date === todayKey);
    points[idx] = {
      ...points[idx],
      planned: plannedProjectProgress(floors, todayStart),
      actual: actualProjectProgressAsOf(floors, todayStart),
    };
  }

  // Pastikan titik akhir jadwal ada
  const endKey = formatKey(end);
  if (!points.some((p) => p.date === endKey)) {
    points.push({
      date: endKey,
      label: formatLabel(end),
      planned: plannedProjectProgress(floors, end),
      actual:
        end.getTime() <= todayStart.getTime()
          ? actualProjectProgressAsOf(floors, end)
          : null,
    });
    points.sort((a, b) => a.date.localeCompare(b.date));
  }

  const plannedToday = plannedProjectProgress(floors, todayStart);
  const actualToday = actualProjectProgressAsOf(floors, todayStart);
  const variance =
    plannedToday == null
      ? null
      : Math.round((actualToday - plannedToday) * 10) / 10;

  return {
    points,
    plannedToday,
    actualToday,
    variance,
    hasSchedule,
  };
}

/** Helper: progress lantai actual sekarang (untuk ringkasan) */
export function floorActualNow(floor: SCurveFloor): number {
  return calcFloorProgress(
    floor.markers.map((m) => ({
      items: m.items.map((i) => ({
        bobot: i.bobot,
        done: i.status === "APPROVED" || i.done,
        progressPct:
          typeof i.progressPct === "number"
            ? i.progressPct
            : i.status === "APPROVED" || i.done
              ? 100
              : 0,
      })),
    }))
  );
}

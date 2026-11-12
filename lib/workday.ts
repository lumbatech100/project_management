/** Platform work-day helpers — timezone Asia/Jakarta (WIB), cutoff 19:00 */

export const WORKDAY_TZ = "Asia/Jakarta";
export const REPORT_CUTOFF_HOUR = 19; // jam 19:00 WIB auto-close

export type JakartaParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
};

export function getJakartaParts(now = new Date()): JakartaParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: WORKDAY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** UTC Date at 00:00:00.000 representing a calendar date (store as @db.Date) */
export function dateOnlyUTC(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

export function addCalendarDays(
  year: number,
  month: number,
  day: number,
  delta: number
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, day] = key.split("-").map(Number);
  return dateOnlyUTC(y, m, day);
}

/**
 * Tanggal kerja aktif untuk submit Leader.
 * Sebelum jam 19:00 WIB → hari ini.
 * Mulai jam 19:00 WIB → besok (report hari ini sudah / sedang ditutup).
 */
export function getActiveWorkDate(now = new Date()): Date {
  const j = getJakartaParts(now);
  if (j.hour >= REPORT_CUTOFF_HOUR) {
    const n = addCalendarDays(j.year, j.month, j.day, 1);
    return dateOnlyUTC(n.year, n.month, n.day);
  }
  return dateOnlyUTC(j.year, j.month, j.day);
}

/** Tanggal kalender hari ini di WIB (untuk job close jam 19:00) */
export function getJakartaTodayDate(now = new Date()): Date {
  const j = getJakartaParts(now);
  return dateOnlyUTC(j.year, j.month, j.day);
}

/** Toleransi input mundur sebelum project dibuat di sistem (data lapangan lama) */
const RECORD_DATE_BACKFILL_DAYS = 365;

/**
 * Validasi tanggal transaksi (delivery / surat jalan): format YYYY-MM-DD,
 * tidak di masa depan (WIB), dan tidak jauh sebelum project dibuat.
 */
export function parseRecordDate(
  key: string,
  projectCreatedAt: Date,
  now = new Date()
): { date: Date } | { error: string } {
  const date = parseDateKey(key);
  if (!date || formatDateKey(date) !== key) {
    return { error: "Format tanggal harus YYYY-MM-DD" };
  }
  const today = getJakartaTodayDate(now);
  if (date.getTime() > today.getTime()) {
    return { error: "Tanggal tidak boleh melebihi hari ini" };
  }
  const start = getJakartaParts(projectCreatedAt);
  const min = addCalendarDays(
    start.year,
    start.month,
    start.day,
    -RECORD_DATE_BACKFILL_DAYS
  );
  const minDate = dateOnlyUTC(min.year, min.month, min.day);
  if (date.getTime() < minDate.getTime()) {
    return {
      error: `Tanggal terlalu lama (minimal ${formatDateKey(minDate)})`,
    };
  }
  return { date };
}

export function isAtOrPastCutoff(now = new Date()): boolean {
  return getJakartaParts(now).hour >= REPORT_CUTOFF_HOUR;
}

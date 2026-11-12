import { prisma } from "@/lib/prisma";
import { calcMarkerProgress } from "@/lib/utils";
import {
  REKAP_CHECKLIST_COLUMNS,
  checklistColumnShort,
} from "@/lib/door-profiles";
import { formatDateKey, getJakartaParts } from "@/lib/workday";

export const REKAP_DOORS_PER_PAGE = 50;

export type RekapCell =
  | { kind: "done"; today: boolean }
  | { kind: "pct"; value: number; today: boolean }
  | { kind: "empty" }
  | { kind: "na" };

export type RekapMarkerRow = {
  label: string;
  markerPct: number;
  cells: Record<string, RekapCell>;
};

export type RekapFloorSnap = {
  floorId: string;
  floorName: string;
  columns: string[];
  markers: RekapMarkerRow[];
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toDateKey(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0
  ) {
    return formatDateKey(d);
  }
  const j = getJakartaParts(d);
  return `${j.year}-${String(j.month).padStart(2, "0")}-${String(j.day).padStart(2, "0")}`;
}

function itemDone(item: {
  done: boolean;
  status: string;
  progressPct: number;
}) {
  return (
    item.done ||
    item.status === "APPROVED" ||
    (item.progressPct ?? 0) >= 100
  );
}

function cellFromItem(
  item:
    | {
        done: boolean;
        status: string;
        progressPct: number;
        activityDate: string | null;
      }
    | undefined,
  workDateKey: string
): RekapCell {
  if (!item) return { kind: "na" };
  const today = !!item.activityDate && item.activityDate === workDateKey;
  if (itemDone(item)) return { kind: "done", today };
  const pct = item.progressPct ?? 0;
  if (pct > 0) return { kind: "pct", value: pct, today };
  return { kind: "empty" };
}

function latestActivityDate(item: {
  workDate: Date | null;
  doneAt: Date | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  progressLogs: { workDate: Date }[];
}): string | null {
  const keys: string[] = [];
  for (const log of item.progressLogs) {
    const k = toDateKey(log.workDate);
    if (k) keys.push(k);
  }
  for (const d of [
    item.workDate,
    item.approvedAt,
    item.submittedAt,
    item.doneAt,
  ]) {
    const k = toDateKey(d);
    if (k) keys.push(k);
  }
  if (keys.length === 0) return null;
  keys.sort();
  return keys[keys.length - 1]!;
}

/**
 * Lantai yang punya pekerjaan di workDate (ada item / log / laporan titik).
 * Isi matrix semua pintu di lantai itu.
 */
export async function buildRekapFloorsForWorkDate(
  projectId: string,
  workDateKey: string
): Promise<RekapFloorSnap[]> {
  const workDate = new Date(`${workDateKey}T00:00:00.000Z`);

  const [itemsOnDay, logsOnDay, markerReportsOnDay] = await Promise.all([
    prisma.breakdownItem.findMany({
      where: { workDate, marker: { floor: { projectId } } },
      select: { marker: { select: { floorId: true } } },
    }),
    prisma.breakdownProgressLog.findMany({
      where: { workDate, item: { marker: { floor: { projectId } } } },
      select: { item: { select: { marker: { select: { floorId: true } } } } },
    }),
    prisma.markerDailyReport.findMany({
      where: {
        dailyReport: { projectId, workDate },
        OR: [
          { status: { in: ["SUBMITTED", "APPROVED", "REJECTED"] } },
          { blocker: { not: null } },
          { notes: { not: null } },
        ],
      },
      select: { marker: { select: { floorId: true } } },
    }),
  ]);

  const floorIds = new Set<string>();
  for (const i of itemsOnDay) floorIds.add(i.marker.floorId);
  for (const l of logsOnDay) floorIds.add(l.item.marker.floorId);
  for (const m of markerReportsOnDay) floorIds.add(m.marker.floorId);

  if (floorIds.size === 0) return [];

  const floors = await prisma.floor.findMany({
    where: { id: { in: Array.from(floorIds) }, projectId },
    orderBy: { createdAt: "asc" },
    include: {
      markers: {
        orderBy: { createdAt: "asc" },
        include: {
          items: {
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            include: {
              progressLogs: {
                select: { workDate: true },
                orderBy: { workDate: "desc" },
                take: 5,
              },
            },
          },
        },
      },
    },
  });

  return floors
    .filter((f) => f.markers.length > 0)
    .map((floor) => {
      const nameSet = new Set<string>();
      for (const m of floor.markers) {
        for (const it of m.items) nameSet.add(it.name);
      }
      const columns = [
        ...REKAP_CHECKLIST_COLUMNS.filter((c) => nameSet.has(c)),
        ...Array.from(nameSet)
          .filter((n) => !REKAP_CHECKLIST_COLUMNS.includes(n))
          .sort((a, b) => a.localeCompare(b, "id")),
      ];
      if (columns.length === 0) {
        columns.push(...REKAP_CHECKLIST_COLUMNS);
      }

      const markers: RekapMarkerRow[] = floor.markers.map((m) => {
        const byName = new Map(
          m.items.map((it) => [
            it.name,
            {
              done: it.done,
              status: it.status,
              progressPct: it.progressPct,
              activityDate: latestActivityDate(it),
            },
          ])
        );
        const cells: Record<string, RekapCell> = {};
        for (const col of columns) {
          cells[col] = cellFromItem(byName.get(col), workDateKey);
        }
        const forPct = m.items.map((i) => ({
          bobot: i.bobot,
          done: itemDone(i),
          progressPct: i.progressPct,
        }));
        return {
          label: m.label,
          markerPct: calcMarkerProgress(forPct),
          cells,
        };
      });

      return {
        floorId: floor.id,
        floorName: floor.name,
        columns,
        markers,
      };
    });
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out.length ? out : [[]];
}

function cellHtml(cell: RekapCell): string {
  if (cell.kind === "done") {
    const color = cell.today ? "#059669" : "#0f172a";
    return `<span style="color:${color};font-weight:700;font-size:12px">✓</span>`;
  }
  if (cell.kind === "pct") {
    const color = cell.today ? "#059669" : "#0f172a";
    return `<span style="color:${color};font-weight:700;font-size:10px">${cell.value}%</span>`;
  }
  if (cell.kind === "na") {
    return `<span style="color:#cbd5e1">·</span>`;
  }
  return "";
}

/** Dokumen HTML landscape: 1 lantai = halaman baru, max 50 pintu/halaman. */
export function buildRekapProgressHtml(opts: {
  projectName: string;
  workDate: string;
  floors: RekapFloorSnap[];
}): string {
  const { projectName, workDate, floors } = opts;
  if (floors.length === 0) {
    return "";
  }

  const pages: string[] = [];
  let pageNo = 0;
  const totalPagesEstimate = floors.reduce(
    (n, f) => n + Math.max(1, Math.ceil(f.markers.length / REKAP_DOORS_PER_PAGE)),
    0
  );

  for (const floor of floors) {
    const slices = chunk(floor.markers, REKAP_DOORS_PER_PAGE);
    slices.forEach((slice, sliceIdx) => {
      pageNo += 1;
      const startNo = sliceIdx * REKAP_DOORS_PER_PAGE;
      const colHeads = floor.columns
        .map(
          (c) =>
            `<th title="${escapeHtml(c)}" style="border:1px solid #64748b;padding:4px 2px;background:#f1f5f9;vertical-align:bottom;height:88px;width:28px">
              <div style="writing-mode:vertical-rl;transform:rotate(180deg);font-size:9px;font-weight:700;color:#334155;white-space:nowrap;margin:0 auto">${escapeHtml(checklistColumnShort(c))}</div>
            </th>`
        )
        .join("");

      const rows = slice
        .map((m, i) => {
          const cells = floor.columns
            .map(
              (c) =>
                `<td style="border:1px solid #94a3b8;padding:3px 2px;text-align:center;${
                  (m.cells[c]?.kind === "done" || m.cells[c]?.kind === "pct") &&
                  (m.cells[c] as { today?: boolean }).today
                    ? "background:#ecfdf5;"
                    : ""
                }">${cellHtml(m.cells[c] || { kind: "empty" })}</td>`
            )
            .join("");
          return `<tr>
            <td style="border:1px solid #94a3b8;padding:3px 5px;text-align:right;color:#64748b;font-size:10px">${startNo + i + 1}</td>
            <td style="border:1px solid #94a3b8;padding:3px 5px;font-size:11px;font-weight:600;white-space:nowrap">${escapeHtml(m.label)}</td>
            ${cells}
            <td style="border:1px solid #94a3b8;padding:3px 5px;text-align:right;font-size:10px;font-weight:700">${m.markerPct}%</td>
          </tr>`;
        })
        .join("");

      pages.push(`
<section class="rekap-page" style="page-break-before:always;break-before:page;padding:12mm 10mm;box-sizing:border-box">
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px;gap:12px">
    <div>
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-weight:700">Lampiran Rekap Progress</div>
      <div style="font-size:16px;font-weight:800;color:#0f172a;margin-top:2px">${escapeHtml(projectName)}</div>
      <div style="font-size:12px;color:#475569;margin-top:2px">
        Lantai <strong>${escapeHtml(floor.floorName)}</strong>
        · ${workDate}
        ${slices.length > 1 ? ` · bagian ${sliceIdx + 1}/${slices.length}` : ""}
        · ${slice.length} pintu
      </div>
    </div>
    <div style="font-size:10px;color:#94a3b8;white-space:nowrap">Hal. ${pageNo}${totalPagesEstimate ? ` / ${totalPagesEstimate}` : ""}</div>
  </div>
  <div style="font-size:9px;color:#64748b;margin-bottom:6px">
    <span style="color:#059669;font-weight:700">Hijau</span> = update hari ini ·
    <span style="color:#0f172a;font-weight:700">✓ hitam</span> = selesai sebelumnya ·
    <span style="color:#dc2626;font-weight:700">% merah</span> = berjalan sebelumnya
  </div>
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px">
    <thead>
      <tr>
        <th style="border:1px solid #64748b;padding:4px;background:#f1f5f9;width:28px;font-size:9px">No</th>
        <th style="border:1px solid #64748b;padding:4px;background:#f1f5f9;width:120px;font-size:9px;text-align:left">Pintu</th>
        ${colHeads}
        <th style="border:1px solid #64748b;padding:4px;background:#f1f5f9;width:36px;font-size:9px">%</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`);
    });
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Rekap Progress — ${escapeHtml(projectName)} — ${escapeHtml(workDate)}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    @media print {
      html, body { margin: 0; padding: 0; }
      .rekap-page { page-break-before: always; break-before: page; }
      .rekap-page:first-child { page-break-before: auto; break-before: auto; }
    }
    body {
      font-family: system-ui, -apple-system, Segoe UI, sans-serif;
      color: #0f172a;
      margin: 0;
      background: #fff;
    }
  </style>
</head>
<body>
${pages.join("\n")}
</body>
</html>`;
}

/** Potongan HTML halaman rekap (tanpa dokumen penuh) — digabung ke print preview. */
export function buildRekapProgressPagesFragment(opts: {
  projectName: string;
  workDate: string;
  floors: RekapFloorSnap[];
}): string {
  const full = buildRekapProgressHtml(opts);
  if (!full) return "";
  const match = full.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return match?.[1]?.trim() || "";
}

import type { DailyReportSnapshot } from "@/lib/daily-report";

export type ReportItem = DailyReportSnapshot["items"][number];

export type MarkerGroup = {
  markerLabel: string;
  items: ReportItem[];
  approvedCount: number;
  pendingSmCount: number;
  openCount: number;
  /** Bobot weighted progress dari item approved di grup ini (0–100) */
  progress: number;
};

export type FloorGroup = {
  floorName: string;
  markers: MarkerGroup[];
  itemCount: number;
  progress: number;
};

export function statusLabelId(status: string): string {
  if (status === "APPROVED") return "Approved";
  if (status === "SUBMITTED") return "Menunggu SM";
  if (status === "OPEN") return "Open";
  return status;
}

export function reportStatusLabelId(status: string): string {
  if (status === "DRAFT" || status === "OPEN") return "Draft";
  if (status === "SUBMITTED") return "Terkirim";
  if (status === "CLOSED") return "Closed";
  return status;
}

export function formatIdDateLong(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatIdDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function markerProgress(items: ReportItem[]): number {
  if (items.length === 0) return 0;
  const total = items.reduce((s, i) => s + i.bobot, 0);
  if (total === 0) return 0;
  const done = items
    .filter((i) => i.status === "APPROVED")
    .reduce((s, i) => s + i.bobot, 0);
  return Math.round((done / total) * 1000) / 10;
}

/** Kelompokkan item: lantai → marker */
export function groupReportItems(items: ReportItem[]): FloorGroup[] {
  const floorMap = new Map<string, Map<string, ReportItem[]>>();

  for (const item of items) {
    const floor = item.floorName || "Lantai";
    const marker = item.markerLabel || "Marker";
    if (!floorMap.has(floor)) floorMap.set(floor, new Map());
    const markers = floorMap.get(floor)!;
    if (!markers.has(marker)) markers.set(marker, []);
    markers.get(marker)!.push(item);
  }

  const floors: FloorGroup[] = [];
  for (const [floorName, markers] of Array.from(floorMap.entries())) {
    const markerGroups: MarkerGroup[] = [];
    let allItems: ReportItem[] = [];
    for (const [markerLabel, mItems] of Array.from(markers.entries())) {
      allItems = allItems.concat(mItems);
      markerGroups.push({
        markerLabel,
        items: mItems,
        approvedCount: mItems.filter((i) => i.status === "APPROVED").length,
        pendingSmCount: mItems.filter((i) => i.status === "SUBMITTED").length,
        openCount: mItems.filter((i) => i.status === "OPEN").length,
        progress: markerProgress(mItems),
      });
    }
    floors.push({
      floorName,
      markers: markerGroups,
      itemCount: allItems.length,
      progress: markerProgress(allItems),
    });
  }

  floors.sort((a, b) => a.floorName.localeCompare(b.floorName, "id"));
  for (const f of floors) {
    f.markers.sort((a, b) => a.markerLabel.localeCompare(b.markerLabel, "id"));
  }
  return floors;
}

/** Item baru hari ini = punya submittedAt di workDate yang sama (atau ada submittedAt) */
export function splitNewVsPending(items: ReportItem[], workDateKey: string) {
  const baru: ReportItem[] = [];
  const lama: ReportItem[] = [];
  for (const i of items) {
    if (!i.submittedAt) {
      lama.push(i);
      continue;
    }
    const day = i.submittedAt.slice(0, 10);
    if (day === workDateKey) baru.push(i);
    else lama.push(i);
  }
  return { baru, lama };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusBadgeColor(status: string): string {
  if (status === "APPROVED") return "#059669";
  if (status === "SUBMITTED") return "#d97706";
  return "#64748b";
}

/** HTML lengkap untuk email laporan harian */
export function buildDailyReportHtml(
  snapshot: DailyReportSnapshot,
  opts?: { projectUrl?: string }
): string {
  const floors = groupReportItems(snapshot.items);
  const { baru, lama } = splitNewVsPending(
    snapshot.items,
    snapshot.workDate
  );

  const headerRows = [
    ["Project", snapshot.projectName],
    ["Tanggal kerja (WIB)", formatIdDateLong(snapshot.workDate)],
    ["Status laporan", reportStatusLabelId(snapshot.status)],
    [
      "Dikirim Leader",
      snapshot.leaderSubmittedAt
        ? `${snapshot.leaderSubmittedBy || "—"} · ${formatIdDateTime(snapshot.leaderSubmittedAt)}`
        : "Belum dikirim",
    ],
  ] as [string, string][];

  if (snapshot.closedAt) {
    headerRows.push(["Waktu close", formatIdDateTime(snapshot.closedAt)]);
  }

  const headerTable = headerRows
    .map(
      ([k, v]) =>
        `<tr>
          <td style="padding:4px 0;color:#64748b;width:140px;vertical-align:top">${escapeHtml(k)}</td>
          <td style="padding:4px 0;font-weight:600">${escapeHtml(v)}</td>
        </tr>`
    )
    .join("");

  const floorSections = floors
    .map((floor) => {
      const markerBlocks = floor.markers
        .map((mg) => {
          const itemRows = mg.items
            .map((i) => {
              const submitLine = i.submittedBy
                ? `Submit: ${escapeHtml(i.submittedBy)} · ${escapeHtml(formatIdDateTime(i.submittedAt))}`
                : "Belum submit";
              const approveLine =
                i.status === "APPROVED" && i.approvedBy
                  ? `Approve: ${escapeHtml(i.approvedBy)} · ${escapeHtml(formatIdDateTime(i.approvedAt))}`
                  : i.status === "SUBMITTED"
                    ? "Menunggu approval SM"
                    : "";
              return `<tr>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0;vertical-align:top">
                  <div style="font-weight:600">${escapeHtml(i.name)}</div>
                  <div style="font-size:12px;color:#64748b;margin-top:2px">Bobot ${i.bobot}%</div>
                  <div style="font-size:12px;color:#64748b;margin-top:4px">${submitLine}</div>
                  ${approveLine ? `<div style="font-size:12px;color:#64748b">${approveLine}</div>` : ""}
                  ${
                    (i.photoUrls || []).length
                      ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${(i.photoUrls || [])
                          .map(
                            (u) =>
                              `<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><img src="${escapeHtml(u)}" alt="Bukti" width="72" height="72" style="object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;width:72px;height:72px" /></a>`
                          )
                          .join("")}</div>`
                      : ""
                  }
                </td>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0;vertical-align:top;white-space:nowrap">
                  <span style="color:${statusBadgeColor(i.status)};font-weight:600;font-size:12px">${escapeHtml(statusLabelId(i.status))}</span>
                </td>
              </tr>`;
            })
            .join("");

          return `<div style="margin:0 0 12px">
            <div style="font-size:13px;font-weight:600;margin:0 0 4px">
              ${escapeHtml(mg.markerLabel)}
              <span style="font-weight:400;color:#64748b"> · progress ${mg.progress}%</span>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:8px">
              <tbody>${itemRows}</tbody>
            </table>
          </div>`;
        })
        .join("");

      return `<div style="margin:0 0 20px">
        <h3 style="margin:0 0 8px;font-size:15px;border-bottom:2px solid #0f172a;padding-bottom:4px">
          ${escapeHtml(floor.floorName)}
          <span style="font-weight:400;color:#64748b;font-size:13px"> · ${floor.itemCount} item · progress ${floor.progress}%</span>
        </h3>
        ${markerBlocks}
      </div>`;
    })
    .join("");

  const baruList =
    baru.length > 0
      ? `<ul style="margin:4px 0 0;padding-left:18px;font-size:13px">${baru
          .map(
            (i) =>
              `<li>${escapeHtml(i.floorName)} / ${escapeHtml(i.markerLabel)} — ${escapeHtml(i.name)} (${escapeHtml(statusLabelId(i.status))})</li>`
          )
          .join("")}</ul>`
      : `<p style="margin:4px 0 0;font-size:13px;color:#94a3b8">Tidak ada</p>`;

  const lamaList =
    lama.length > 0
      ? `<ul style="margin:4px 0 0;padding-left:18px;font-size:13px">${lama
          .map(
            (i) =>
              `<li>${escapeHtml(i.floorName)} / ${escapeHtml(i.markerLabel)} — ${escapeHtml(i.name)} (${escapeHtml(statusLabelId(i.status))})</li>`
          )
          .join("")}</ul>`
      : `<p style="margin:4px 0 0;font-size:13px;color:#94a3b8">Tidak ada</p>`;

  const projectLink = opts?.projectUrl
    ? `<p style="margin:8px 0 0;font-size:12px"><a href="${escapeHtml(opts.projectUrl)}" style="color:#0f172a">Buka project di Simplo PMS</a></p>`
    : "";

  return `<!DOCTYPE html>
<html>
<body style="font-family:system-ui,-apple-system,sans-serif;color:#0f172a;line-height:1.5;max-width:720px;margin:0 auto;padding:16px">
  <h1 style="margin:0 0 4px;font-size:20px">Laporan Harian</h1>
  <p style="margin:0 0 16px;color:#64748b;font-size:13px">Simplo PMS · fokus pekerjaan lapangan</p>

  <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:13px">
    ${headerTable}
  </table>

  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin:0 0 20px">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;margin-bottom:8px">Ringkasan lapangan</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr>
        <td style="padding:3px 0;color:#64748b">Manpower</td>
        <td style="padding:3px 0;font-weight:600">${snapshot.manpower ?? "—"}</td>
        <td style="padding:3px 0;color:#64748b">Jam kerja</td>
        <td style="padding:3px 0;font-weight:600">${snapshot.workHours ?? "—"}</td>
      </tr>
      <tr>
        <td style="padding:3px 0;color:#64748b">Total item</td>
        <td style="padding:3px 0;font-weight:600">${snapshot.counts.total}</td>
        <td style="padding:3px 0;color:#64748b">Menunggu SM</td>
        <td style="padding:3px 0;font-weight:600">${snapshot.counts.pendingSm}</td>
      </tr>
      <tr>
        <td style="padding:3px 0;color:#64748b">Laporan titik</td>
        <td style="padding:3px 0;font-weight:600" colspan="3">
          ${(snapshot.markerReportCounts?.total ?? snapshot.markerReports?.length) || 0} titik
          · menunggu SM ${snapshot.markerReportCounts?.submitted ?? 0}
          · approved ${snapshot.markerReportCounts?.approved ?? 0}
        </td>
      </tr>
    </table>
    ${
      snapshot.notes
        ? `<p style="margin:10px 0 0;font-size:13px"><strong>Catatan project:</strong> ${escapeHtml(snapshot.notes)}</p>`
        : ""
    }
  </div>

  ${
    (snapshot.markerReports || []).length
      ? `<div style="margin:0 0 20px">
    <h2 style="margin:0 0 10px;font-size:16px">Laporan per titik</h2>
    ${snapshot.markerReports
      .map((mr) => {
        const st =
          mr.status === "APPROVED"
            ? "Approved SM"
            : mr.status === "SUBMITTED"
              ? "Menunggu SM"
              : mr.status === "REJECTED"
                ? "Ditolak"
                : "Draft";
        return `<div style="margin:0 0 12px;padding:12px;border:1px solid #e2e8f0;border-radius:8px">
          <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px">
            <div>
              <div style="font-weight:700;font-size:14px">${escapeHtml(mr.floorName)} · ${escapeHtml(mr.markerLabel)}</div>
              <div style="font-size:12px;color:#64748b">Progress titik ${mr.markerProgress}% · ${escapeHtml(st)}</div>
            </div>
          </div>
          ${
            mr.submittedBy
              ? `<div style="font-size:12px;color:#64748b;margin-bottom:4px">Leader: ${escapeHtml(mr.submittedBy)} · ${escapeHtml(formatIdDateTime(mr.submittedAt))}</div>`
              : ""
          }
          ${
            mr.blocker
              ? `<p style="margin:6px 0 0;font-size:13px;color:#b45309"><strong>Blocker:</strong> ${escapeHtml(mr.blocker)}</p>`
              : `<p style="margin:6px 0 0;font-size:12px;color:#94a3b8">Tidak ada blocker</p>`
          }
          ${
            (mr.blockerPhotos || []).length
              ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${(mr.blockerPhotos || [])
                  .map(
                    (u) =>
                      `<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><img src="${escapeHtml(u)}" alt="Blocker" width="72" height="72" style="object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;width:72px;height:72px" /></a>`
                  )
                  .join("")}</div>`
              : ""
          }
          ${
            mr.notes
              ? `<p style="margin:4px 0 0;font-size:13px"><strong>Catatan titik:</strong> ${escapeHtml(mr.notes)}</p>`
              : ""
          }
          ${
            mr.status === "REJECTED" && mr.rejectReason
              ? `<p style="margin:4px 0 0;font-size:12px;color:#dc2626">Tolak: ${escapeHtml(mr.rejectReason)}</p>`
              : ""
          }
        </div>`;
      })
      .join("")}
  </div>`
      : ""
  }

  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin:0 0 20px">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;margin-bottom:10px">Progress</div>
    ${(() => {
      const reported = new Set([
        ...snapshot.items.map((i) => i.floorName),
        ...(snapshot.markerReports || []).map((m) => m.floorName),
      ]);
      const floorsProg = (snapshot.progressDetail?.floors || []).filter((f) =>
        reported.size === 0 ? false : reported.has(f.name)
      );
      const bar = (label: string, pct: number | null | undefined, dark?: boolean) => {
        const p = pct ?? 0;
        const bg = dark ? "#0f172a" : "#fff";
        const border = dark ? "#0f172a" : "#e2e8f0";
        const titleColor = dark ? "#fff" : "#0f172a";
        const track = dark ? "#334155" : "#e2e8f0";
        const fill = dark ? "#34d399" : "#0f172a";
        return `<div style="margin:0 0 10px;padding:10px 12px;background:${bg};border:1px solid ${border};border-radius:8px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px;color:${titleColor}">
            <strong>${escapeHtml(label)}</strong>
            <strong>${pct != null ? `${pct}%` : "—"}</strong>
          </div>
          <div style="height:10px;background:${track};border-radius:999px;overflow:hidden">
            <div style="height:100%;width:${Math.min(100, Math.max(0, p))}%;background:${fill};border-radius:999px"></div>
          </div>
        </div>`;
      };
      const parts = floorsProg.map((f) => bar(f.name, f.progress));
      parts.push(bar("Progress keseluruhan", snapshot.projectProgress, true));
      return parts.join("");
    })()}
  </div>

  <h2 style="margin:0 0 12px;font-size:16px">Detail pekerjaan</h2>
  ${
    floors.length
      ? floorSections
      : `<p style="color:#94a3b8;font-size:13px">Belum ada item progress di tanggal ini.</p>`
  }

  ${
    snapshot.items.length
      ? `<div style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e2e8f0">
    <h2 style="margin:0 0 10px;font-size:15px">Aktivitas hari ini vs pending</h2>
    <div style="margin-bottom:12px">
      <div style="font-size:12px;font-weight:700;color:#64748b">Baru dikerjakan / di-submit hari ini (${baru.length})</div>
      ${baruList}
    </div>
    <div>
      <div style="font-size:12px;font-weight:700;color:#64748b">Pending / dari hari sebelumnya (${lama.length})</div>
      ${lamaList}
    </div>
  </div>`
      : ""
  }

  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">
    <p style="margin:0">Dikirim otomatis oleh Simplo PMS</p>
    ${projectLink}
  </div>
</body>
</html>`;
}

/** Plain-text fallback untuk email */
export function buildDailyReportText(snapshot: DailyReportSnapshot): string {
  const floors = groupReportItems(snapshot.items);
  const lines: string[] = [
    `Laporan Harian — ${snapshot.projectName}`,
    `Tanggal kerja (WIB): ${formatIdDateLong(snapshot.workDate)}`,
    `Status: ${reportStatusLabelId(snapshot.status)}`,
    snapshot.leaderSubmittedAt
      ? `Dikirim Leader: ${snapshot.leaderSubmittedBy || "—"} · ${formatIdDateTime(snapshot.leaderSubmittedAt)}`
      : "Dikirim Leader: Belum",
    snapshot.closedAt
      ? `Closed: ${formatIdDateTime(snapshot.closedAt)}`
      : "",
    "",
    `Manpower: ${snapshot.manpower ?? "—"} | Jam kerja: ${snapshot.workHours ?? "—"}`,
    `Item: ${snapshot.counts.total} | Menunggu SM: ${snapshot.counts.pendingSm} | Approved: ${snapshot.counts.approved}`,
    snapshot.notes ? `Catatan: ${snapshot.notes}` : "",
    snapshot.blocker ? `Blocker: ${snapshot.blocker}` : "",
    `Progress project: ${snapshot.projectProgress ?? "—"}%`,
    "",
    "Progress per lantai (yang dilaporkan):",
  ].filter((l) => l !== "");

  const reportedFloorNames = new Set(snapshot.items.map((i) => i.floorName));
  if (snapshot.progressDetail?.floors) {
    for (const f of snapshot.progressDetail.floors) {
      if (!reportedFloorNames.has(f.name)) continue;
      lines.push(`  ${f.name}: ${f.progress}%`);
    }
  }
  lines.push(`  Progress keseluruhan: ${snapshot.projectProgress ?? "—"}%`);

  lines.push("", "Detail pekerjaan:");

  for (const floor of floors) {
    lines.push(`\n## ${floor.floorName} (${floor.progress}%)`);
    for (const mg of floor.markers) {
      lines.push(`  ${mg.markerLabel} (${mg.progress}%)`);
      for (const i of mg.items) {
        lines.push(
          `    - ${i.name} [${i.bobot}%] ${statusLabelId(i.status)}` +
            (i.submittedBy
              ? ` | submit ${i.submittedBy} ${formatIdDateTime(i.submittedAt)}`
              : "") +
            (i.approvedBy
              ? ` | approve ${i.approvedBy} ${formatIdDateTime(i.approvedAt)}`
              : "")
        );
      }
    }
  }

  lines.push("", "— Dikirim otomatis oleh Simplo PMS");
  return lines.join("\n");
}

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  calcFloorProgress,
  calcMarkerProgress,
  calcProjectProgress,
} from "@/lib/utils";
import {
  formatDateKey,
  getActiveWorkDate,
  getJakartaTodayDate,
  isAtOrPastCutoff,
} from "@/lib/workday";

/** Pastikan ada DailyReport yang belum CLOSED untuk project + workDate */
export async function ensureOpenDailyReport(
  projectId: string,
  workDate: Date = getActiveWorkDate()
) {
  const existing = await prisma.dailyReport.findUnique({
    where: {
      projectId_workDate: { projectId, workDate },
    },
  });

  if (existing) {
    if (existing.status === "CLOSED") {
      return { report: existing, ok: false as const, reason: "closed" as const };
    }
    return { report: existing, ok: true as const, reason: "exists" as const };
  }

  const report = await prisma.dailyReport.create({
    data: {
      projectId,
      workDate,
      status: "DRAFT",
    },
  });

  return { report, ok: true as const, reason: "created" as const };
}

export type ProgressDetail = {
  project: number;
  floors: {
    name: string;
    progress: number;
    markers: { label: string; progress: number }[];
  }[];
};

export type MarkerReportSnap = {
  id: string;
  markerId: string;
  markerLabel: string;
  floorName: string;
  blocker: string | null;
  notes: string | null;
  blockerPhotos: string[];
  status: string;
  submittedAt: string | null;
  submittedBy: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectReason: string | null;
  markerProgress: number;
};

export type DailyReportSnapshot = {
  reportId: string;
  projectId: string;
  projectName: string;
  workDate: string;
  status: string;
  closedAt: string | null;
  emailStatus: string | null;
  emailSentAt: string | null;
  manpower: number | null;
  workHours: number | null;
  notes: string | null;
  blocker: string | null;
  projectProgress: number | null;
  progressDetail: ProgressDetail | null;
  summary: string | null;
  leaderSubmittedAt: string | null;
  leaderSubmittedBy: string | null;
  counts: {
    submitted: number;
    approved: number;
    pendingSm: number;
    total: number;
  };
  markerReports: MarkerReportSnap[];
  markerReportCounts: {
    total: number;
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
  };
  items: {
    id: string;
    name: string;
    bobot: number;
    status: string;
    markerLabel: string;
    floorName: string;
    submittedBy: string | null;
    submittedAt: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    photoUrls: string[];
  }[];
};

function itemDone(item: { done: boolean; status?: string | null }) {
  return item.done || item.status === "APPROVED";
}

/** Ambil snapshot progress project (titik / lantai / keseluruhan) */
export async function captureProjectProgress(
  projectId: string
): Promise<ProgressDetail> {
  const floors = await prisma.floor.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: {
      markers: {
        include: { items: true },
      },
    },
  });

  const floorsForCalc = floors.map((f) => ({
    markers: f.markers.map((m) => ({
      items: m.items.map((i) => ({
        bobot: i.bobot,
        done: itemDone(i),
      })),
    })),
  }));

  return {
    project: calcProjectProgress(floorsForCalc),
    floors: floors.map((f, fi) => ({
      name: f.name,
      progress: calcFloorProgress(floorsForCalc[fi].markers),
      markers: f.markers.map((m, mi) => ({
        label: m.label,
        progress: calcMarkerProgress(floorsForCalc[fi].markers[mi].items),
      })),
    })),
  };
}

export function buildAutoSummary(
  items: {
    name: string;
    status: string;
    marker: { label: string; floor: { name: string } };
  }[]
): string {
  if (items.length === 0) {
    return "Belum ada pekerjaan yang di-submit dari Progress hari ini.";
  }
  const byFloor = new Map<string, Map<string, string[]>>();
  for (const i of items) {
    const floor = i.marker.floor.name;
    const marker = i.marker.label;
    if (!byFloor.has(floor)) byFloor.set(floor, new Map());
    const markers = byFloor.get(floor)!;
    if (!markers.has(marker)) markers.set(marker, []);
    markers.get(marker)!.push(`${i.name} (${i.status})`);
  }
  const lines: string[] = [`Pekerjaan hari ini (${items.length} item):`];
  for (const [floor, markers] of Array.from(byFloor.entries())) {
    lines.push(`\n${floor}`);
    for (const [marker, names] of Array.from(markers.entries())) {
      lines.push(`  ${marker}`);
      for (const n of names) lines.push(`    - ${n}`);
    }
  }
  return lines.join("\n");
}

function parseProgressDetail(raw: unknown): ProgressDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as ProgressDetail;
  if (typeof o.project !== "number" || !Array.isArray(o.floors)) return null;
  return o;
}

export async function buildDailyReportSnapshot(
  reportId: string
): Promise<DailyReportSnapshot | null> {
  const report = await prisma.dailyReport.findUnique({
    where: { id: reportId },
    include: {
      project: { select: { id: true, name: true } },
      items: {
        include: {
          marker: {
            select: {
              label: true,
              floor: { select: { name: true } },
            },
          },
        },
        orderBy: [{ submittedAt: "asc" }, { name: "asc" }],
      },
      markerReports: {
        include: {
          marker: {
            include: {
              floor: { select: { name: true } },
              items: true,
            },
          },
        },
        orderBy: { submittedAt: "asc" },
      },
    },
  });

  if (!report) return null;

  const pendingSm = report.items.filter((i) => i.status === "SUBMITTED").length;
  const approved = report.items.filter((i) => i.status === "APPROVED").length;

  let progressDetail = parseProgressDetail(report.progressDetail);
  let projectProgress = report.projectProgress;

  if (!progressDetail) {
    progressDetail = await captureProjectProgress(report.projectId);
    projectProgress = progressDetail.project;
  }

  const markerReports: MarkerReportSnap[] = report.markerReports.map((mr) => {
    const items = mr.marker.items.map((i) => ({
      bobot: i.bobot,
      done: itemDone(i),
    }));
    return {
      id: mr.id,
      markerId: mr.markerId,
      markerLabel: mr.marker.label,
      floorName: mr.marker.floor.name,
      blocker: mr.blocker,
      notes: mr.notes,
      blockerPhotos: mr.blockerPhotos || [],
      status: mr.status,
      submittedAt: mr.submittedAt?.toISOString() ?? null,
      submittedBy: mr.submittedBy,
      reviewedAt: mr.reviewedAt?.toISOString() ?? null,
      reviewedBy: mr.reviewedBy,
      rejectReason: mr.rejectReason,
      markerProgress: calcMarkerProgress(items),
    };
  });

  return {
    reportId: report.id,
    projectId: report.projectId,
    projectName: report.project.name,
    workDate: formatDateKey(report.workDate),
    status: report.status,
    closedAt: report.closedAt?.toISOString() ?? null,
    emailStatus: report.emailStatus,
    emailSentAt: report.emailSentAt?.toISOString() ?? null,
    manpower: report.manpower,
    workHours: report.workHours,
    notes: report.notes,
    blocker: report.blocker,
    projectProgress: projectProgress ?? progressDetail.project,
    progressDetail,
    summary: report.summary,
    leaderSubmittedAt: report.leaderSubmittedAt?.toISOString() ?? null,
    leaderSubmittedBy: report.leaderSubmittedBy,
    counts: {
      submitted: pendingSm + approved,
      approved,
      pendingSm,
      total: report.items.length,
    },
    markerReports,
    markerReportCounts: {
      total: markerReports.length,
      draft: markerReports.filter((r) => r.status === "DRAFT").length,
      submitted: markerReports.filter((r) => r.status === "SUBMITTED").length,
      approved: markerReports.filter((r) => r.status === "APPROVED").length,
      rejected: markerReports.filter((r) => r.status === "REJECTED").length,
    },
    items: report.items.map((i) => ({
      id: i.id,
      name: i.name,
      bobot: i.bobot,
      status: i.status,
      markerLabel: i.marker.label,
      floorName: i.marker.floor.name,
      submittedBy: i.submittedBy,
      submittedAt: i.submittedAt?.toISOString() ?? null,
      approvedBy: i.approvedBy,
      approvedAt: i.approvedAt?.toISOString() ?? null,
      photoUrls: i.photoUrls || [],
    })),
  };
}

/** Simpan snapshot progress ke report (saat kirim / tutup) */
export async function persistProgressSnapshot(reportId: string, projectId: string) {
  const detail = await captureProjectProgress(projectId);
  await prisma.dailyReport.update({
    where: { id: reportId },
    data: {
      projectProgress: detail.project,
      progressDetail: detail as unknown as Prisma.InputJsonValue,
    },
  });
  return detail;
}

/**
 * Tutup semua report DRAFT/SUBMITTED untuk tanggal kerja hari ini (WIB).
 */
export async function closeDailyReportsForToday(
  now = new Date(),
  opts?: { force?: boolean }
) {
  if (!opts?.force && !isAtOrPastCutoff(now)) {
    return {
      skipped: true as const,
      reason: "Belum jam cutoff 19:00 WIB",
      closed: [] as string[],
    };
  }

  const workDate = getJakartaTodayDate(now);
  const open = await prisma.dailyReport.findMany({
    where: {
      workDate,
      status: { in: ["DRAFT", "SUBMITTED"] },
    },
  });

  const closed: string[] = [];
  const closedAt = now;

  for (const r of open) {
    const detail = await captureProjectProgress(r.projectId);
    await prisma.dailyReport.update({
      where: { id: r.id },
      data: {
        status: "CLOSED",
        closedAt,
        emailStatus: r.emailStatus ?? "pending",
        projectProgress: detail.project,
        progressDetail: detail as unknown as Prisma.InputJsonValue,
      },
    });
    closed.push(r.id);
  }

  const activeProjects = await prisma.project.findMany({
    where: { status: "active" },
    select: { id: true },
  });
  for (const p of activeProjects) {
    const exists = await prisma.dailyReport.findUnique({
      where: {
        projectId_workDate: { projectId: p.id, workDate },
      },
    });
    if (!exists) {
      const detail = await captureProjectProgress(p.id);
      const created = await prisma.dailyReport.create({
        data: {
          projectId: p.id,
          workDate,
          status: "CLOSED",
          closedAt,
          emailStatus: "skipped",
          summary: "Tidak ada aktivitas / laporan tidak dibuat.",
          projectProgress: detail.project,
          progressDetail: detail as unknown as Prisma.InputJsonValue,
        },
      });
      closed.push(created.id);
    }
  }

  return {
    skipped: false as const,
    workDate: formatDateKey(workDate),
    closed,
  };
}

import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import {
  buildAutoSummary,
  buildDailyReportSnapshot,
  captureProjectProgress,
  ensureOpenDailyReport,
} from "@/lib/daily-report";
import {
  formatDateKey,
  getActiveWorkDate,
  getJakartaTodayDate,
  parseDateKey,
} from "@/lib/workday";
import {
  canManageDailyReport,
  canSubmitProgress,
  isViewOnlyRole,
} from "@/lib/utils";
import { hasMenu } from "@/lib/menus";
import { countPresent } from "@/lib/attendance";

type Params = { params: Promise<{ id: string }> };

/** List / detail laporan harian */
export async function GET(req: NextRequest, props: Params) {
  const params = await props.params;
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await forbidUnlessProjectAccess(
    session.user.id,
    session.user.role,
    params.id
  );
  if (denied) return denied;
  if (!hasMenu(session.user.menus || [], "project.laporan")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const active = getActiveWorkDate();
  const today = getJakartaTodayDate();

  if (dateParam) {
    const workDate = parseDateKey(dateParam);
    if (!workDate) {
      return NextResponse.json(
        { error: "Format date harus YYYY-MM-DD" },
        { status: 400 }
      );
    }
    let report = await prisma.dailyReport.findUnique({
      where: {
        projectId_workDate: { projectId: params.id, workDate },
      },
    });
    // Auto-create DRAFT untuk hari aktif (Leader bisa isi form)
    if (
      !report &&
      formatDateKey(workDate) === formatDateKey(active)
    ) {
      const ensured = await ensureOpenDailyReport(params.id, workDate);
      report = ensured.report;
    }
    const attendancePresent = await countPresent(params.id, workDate);
    if (!report) {
      return NextResponse.json({
        meta: {
          activeWorkDate: formatDateKey(active),
          jakartaToday: formatDateKey(today),
          cutoffHour: 19,
          attendancePresent,
        },
        report: null,
        snapshot: null,
      });
    }
    const snapshot = await buildDailyReportSnapshot(report.id);
    return NextResponse.json({
      meta: {
        activeWorkDate: formatDateKey(active),
        jakartaToday: formatDateKey(today),
        cutoffHour: 19,
        attendancePresent,
      },
      report,
      snapshot,
    });
  }

  const reports = await prisma.dailyReport.findMany({
    where: { projectId: params.id },
    orderBy: { workDate: "desc" },
    take: 60,
    include: {
      items: { select: { status: true } },
      markerReports: {
        where: { status: "SUBMITTED" },
        select: { id: true },
      },
    },
  });

  const pendingApprovals = await prisma.markerDailyReport.findMany({
    where: {
      status: "SUBMITTED",
      dailyReport: {
        projectId: params.id,
        status: { not: "CLOSED" },
      },
    },
    orderBy: { submittedAt: "asc" },
    include: {
      marker: {
        select: {
          id: true,
          label: true,
          floorId: true,
          floor: { select: { id: true, name: true } },
        },
      },
      dailyReport: {
        select: { workDate: true, id: true },
      },
    },
  });

  return NextResponse.json({
    meta: {
      activeWorkDate: formatDateKey(active),
      jakartaToday: formatDateKey(today),
      cutoffHour: 19,
      timezone: "Asia/Jakarta",
    },
    pendingApprovals: pendingApprovals.map((p) => ({
      id: p.id,
      markerId: p.markerId,
      floorId: p.marker.floorId,
      markerLabel: p.marker.label,
      floorName: p.marker.floor.name,
      blocker: p.blocker,
      notes: p.notes,
      blockerPhotos: p.blockerPhotos || [],
      submittedAt: p.submittedAt,
      submittedBy: p.submittedBy,
      workDate: formatDateKey(p.dailyReport.workDate),
      dailyReportId: p.dailyReport.id,
    })),
    reports: reports.map((r) => {
      const pendingSm = r.items.filter((i) => i.status === "SUBMITTED").length;
      const approved = r.items.filter((i) => i.status === "APPROVED").length;
      return {
        id: r.id,
        projectId: r.projectId,
        workDate: formatDateKey(r.workDate),
        status: r.status,
        closedAt: r.closedAt,
        emailStatus: r.emailStatus,
        emailSentAt: r.emailSentAt,
        leaderSubmittedAt: r.leaderSubmittedAt,
        manpower: r.manpower,
        workHours: r.workHours,
        createdAt: r.createdAt,
        pendingMarkerReports: r.markerReports.length,
        counts: {
          total: r.items.length,
          pendingSm,
          approved,
          submitted: pendingSm + approved,
        },
      };
    }),
  });
}

export async function POST(req: NextRequest, props: Params) {
  const params = await props.params;
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await forbidUnlessProjectAccess(
    session.user.id,
    session.user.role,
    params.id
  );
  if (denied) return denied;
  if (
    isViewOnlyRole(session.user.role) ||
    !hasMenu(session.user.menus || [], "project.laporan")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const action = body.action as string;
  const dateKey =
    typeof body.date === "string"
      ? body.date
      : formatDateKey(getActiveWorkDate());
  const workDate = parseDateKey(dateKey);
  if (!workDate || formatDateKey(workDate) !== dateKey) {
    return NextResponse.json(
      { error: "Format date harus YYYY-MM-DD" },
      { status: 400 }
    );
  }
  const activeKey = formatDateKey(getActiveWorkDate());

  const who = session.user.name || session.user.email || "User";

  // —— Leader: simpan draft / kirim laporan ——
  if (action === "save-draft" || action === "send") {
    if (
      !canSubmitProgress(session.user.role, session.user.menus) &&
      !canManageDailyReport(session.user.role, session.user.menus)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (dateKey !== activeKey) {
      return NextResponse.json(
        {
          error: `Laporan hanya bisa diisi untuk tanggal kerja aktif (${activeKey})`,
        },
        { status: 400 }
      );
    }

    const ensured = await ensureOpenDailyReport(params.id, workDate);
    if (!ensured.ok) {
      return NextResponse.json(
        { error: "Laporan hari ini sudah ditutup" },
        { status: 409 }
      );
    }

    const manpower = await countPresent(params.id, workDate);
    const workHours =
      body.workHours === "" || body.workHours == null
        ? null
        : parseFloat(String(body.workHours));
    const notes =
      typeof body.notes === "string" ? body.notes.trim() || null : null;
    const blocker =
      typeof body.blocker === "string" ? body.blocker.trim() || null : null;

    if (workHours != null && (Number.isNaN(workHours) || workHours < 0)) {
      return NextResponse.json({ error: "Jam kerja tidak valid" }, { status: 400 });
    }

    const items = await prisma.breakdownItem.findMany({
      where: { dailyReportId: ensured.report.id },
      include: {
        marker: { select: { label: true, floor: { select: { name: true } } } },
      },
    });
    const summary = buildAutoSummary(items);
    const progressDetail = await captureProjectProgress(params.id);

    if (action === "send") {
      if (items.length === 0 && !notes && !blocker) {
        return NextResponse.json(
          {
            error:
              "Belum ada pekerjaan di Progress. Submit item dulu, atau isi catatan/blocker minimal.",
          },
          { status: 400 }
        );
      }
      const updated = await prisma.dailyReport.update({
        where: { id: ensured.report.id },
        data: {
          status: "SUBMITTED",
          manpower,
          workHours,
          notes,
          blocker,
          summary,
          projectProgress: progressDetail.project,
          progressDetail,
          leaderSubmittedAt: new Date(),
          leaderSubmittedBy: who,
        },
      });
      const snapshot = await buildDailyReportSnapshot(updated.id);
      return NextResponse.json({ report: updated, snapshot });
    }

    const updated = await prisma.dailyReport.update({
      where: { id: ensured.report.id },
      data: {
        manpower,
        workHours,
        notes,
        blocker,
        summary,
        projectProgress: progressDetail.project,
        progressDetail,
        status:
          ensured.report.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT",
      },
    });
    const snapshot = await buildDailyReportSnapshot(updated.id);
    return NextResponse.json({ report: updated, snapshot });
  }

  // —— Admin/PM manage ——
  if (!canManageDailyReport(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let report = await prisma.dailyReport.findUnique({
    where: {
      projectId_workDate: { projectId: params.id, workDate },
    },
  });

  if (action === "close") {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { createdAt: true },
    });
    const projectStartKey = project
      ? formatDateKey(getJakartaTodayDate(project.createdAt))
      : activeKey;
    if (!report && (dateKey > activeKey || dateKey < projectStartKey)) {
      return NextResponse.json(
        {
          error: `Tanggal laporan harus antara ${projectStartKey} dan ${activeKey}`,
        },
        { status: 400 }
      );
    }
    const progressDetail = await captureProjectProgress(params.id);
    const present = await countPresent(params.id, workDate);
    if (!report) {
      report = await prisma.dailyReport.create({
        data: {
          projectId: params.id,
          workDate,
          status: "CLOSED",
          closedAt: new Date(),
          emailStatus: "pending",
          manpower: present,
          projectProgress: progressDetail.project,
          progressDetail,
        },
      });
    } else if (report.status !== "CLOSED") {
      report = await prisma.dailyReport.update({
        where: { id: report.id },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          emailStatus: report.emailStatus ?? "pending",
          manpower: present,
          projectProgress: progressDetail.project,
          progressDetail,
        },
      });
    }
    const snapshot = await buildDailyReportSnapshot(report.id);
    return NextResponse.json({ report, snapshot });
  }

  if (action === "reopen") {
    if (!report) {
      return NextResponse.json({ error: "Report tidak ditemukan" }, { status: 404 });
    }
    report = await prisma.dailyReport.update({
      where: { id: report.id },
      data: {
        status: report.leaderSubmittedAt ? "SUBMITTED" : "DRAFT",
        closedAt: null,
      },
    });
    const snapshot = await buildDailyReportSnapshot(report.id);
    return NextResponse.json({ report, snapshot });
  }

  if (action === "retry-email") {
    if (!report) {
      return NextResponse.json({ error: "Report tidak ditemukan" }, { status: 404 });
    }
    if (report.status !== "CLOSED") {
      return NextResponse.json(
        { error: "Email hanya untuk report yang sudah CLOSED" },
        { status: 400 }
      );
    }
    await prisma.dailyReport.update({
      where: { id: report.id },
      data: {
        emailStatus: "pending",
        emailError: null,
        emailSentAt: null,
      },
    });
    const { processPendingDailyReportEmails } = await import("@/lib/email");
    await processPendingDailyReportEmails();
    const refreshed = await prisma.dailyReport.findUnique({
      where: { id: report.id },
    });
    const snapshot = await buildDailyReportSnapshot(report.id);
    return NextResponse.json({ report: refreshed, snapshot });
  }

  return NextResponse.json(
    { error: "Action tidak valid (send|save-draft|close|reopen|retry-email)" },
    { status: 400 }
  );
}

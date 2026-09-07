import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureOpenDailyReport } from "@/lib/daily-report";
import { formatDateKey, getActiveWorkDate } from "@/lib/workday";
import { canApproveProgress, canSubmitProgress } from "@/lib/utils";

type Params = { params: { id: string; markerId: string } };

async function getMarkerInProject(projectId: string, markerId: string) {
  return prisma.marker.findFirst({
    where: {
      id: markerId,
      floor: { projectId },
    },
    include: {
      floor: { select: { name: true } },
    },
  });
}

/** GET laporan titik untuk work date aktif (atau ?date=) */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const marker = await getMarkerInProject(params.id, params.markerId);
  if (!marker) {
    return NextResponse.json({ error: "Marker tidak ditemukan" }, { status: 404 });
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const workDate = dateParam
    ? new Date(dateParam + "T00:00:00.000Z")
    : getActiveWorkDate();

  const daily = await prisma.dailyReport.findUnique({
    where: {
      projectId_workDate: { projectId: params.id, workDate },
    },
  });

  if (!daily) {
    return NextResponse.json({
      workDate: formatDateKey(workDate),
      dailyReportClosed: false,
      report: null,
      marker: { id: marker.id, label: marker.label, floorName: marker.floor.name },
    });
  }

  const report = await prisma.markerDailyReport.findUnique({
    where: {
      dailyReportId_markerId: {
        dailyReportId: daily.id,
        markerId: marker.id,
      },
    },
  });

  return NextResponse.json({
    workDate: formatDateKey(workDate),
    dailyReportClosed: daily.status === "CLOSED",
    report,
    marker: { id: marker.id, label: marker.label, floorName: marker.floor.name },
  });
}

/**
 * POST actions:
 * - save-draft | submit  (Leader)
 * - approve | reject     (SM/Admin)
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const marker = await getMarkerInProject(params.id, params.markerId);
  if (!marker) {
    return NextResponse.json({ error: "Marker tidak ditemukan" }, { status: 404 });
  }

  const body = await req.json();
  const action = body.action as string;
  const who = session.user.name || session.user.email || "User";
  const workDate = getActiveWorkDate();

  const ensured = await ensureOpenDailyReport(params.id, workDate);
  if (!ensured.ok) {
    return NextResponse.json(
      {
        error: `Laporan harian ${formatDateKey(workDate)} sudah ditutup (cutoff 19:00 WIB)`,
      },
      { status: 409 }
    );
  }

  const daily = ensured.report;

  let report = await prisma.markerDailyReport.findUnique({
    where: {
      dailyReportId_markerId: {
        dailyReportId: daily.id,
        markerId: marker.id,
      },
    },
  });

  if (!report) {
    report = await prisma.markerDailyReport.create({
      data: {
        dailyReportId: daily.id,
        markerId: marker.id,
        status: "DRAFT",
      },
    });
  }

  if (action === "save-draft" || action === "submit") {
    if (!canSubmitProgress(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (report.status === "APPROVED") {
      return NextResponse.json(
        { error: "Laporan titik sudah di-approve SM, tidak bisa diubah" },
        { status: 409 }
      );
    }

    const blocker =
      typeof body.blocker === "string" ? body.blocker.trim() || null : null;
    const notes =
      typeof body.notes === "string" ? body.notes.trim() || null : null;

    if (action === "submit" && !blocker) {
      // blocker boleh kosong? User said blocker per titik - allow empty but encourage
      // Allow submit without blocker
    }

    if (action === "submit") {
      const updated = await prisma.markerDailyReport.update({
        where: { id: report.id },
        data: {
          blocker,
          notes,
          status: "SUBMITTED",
          submittedAt: new Date(),
          submittedBy: who,
          reviewedAt: null,
          reviewedBy: null,
          rejectReason: null,
        },
      });
      return NextResponse.json({ report: updated });
    }

    const updated = await prisma.markerDailyReport.update({
      where: { id: report.id },
      data: {
        blocker,
        notes,
        status: report.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT",
      },
    });
    return NextResponse.json({ report: updated });
  }

  if (action === "approve" || action === "reject") {
    if (!canApproveProgress(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (report.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: "Hanya laporan SUBMITTED yang bisa di-review" },
        { status: 400 }
      );
    }

    if (action === "approve") {
      const updated = await prisma.markerDailyReport.update({
        where: { id: report.id },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedBy: who,
          rejectReason: null,
        },
      });
      return NextResponse.json({ report: updated });
    }

    const rejectReason =
      typeof body.rejectReason === "string"
        ? body.rejectReason.trim() || null
        : null;
    const updated = await prisma.markerDailyReport.update({
      where: { id: report.id },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedBy: who,
        rejectReason,
      },
    });
    return NextResponse.json({ report: updated });
  }

  return NextResponse.json(
    { error: "Action tidak valid (save-draft|submit|approve|reject)" },
    { status: 400 }
  );
}

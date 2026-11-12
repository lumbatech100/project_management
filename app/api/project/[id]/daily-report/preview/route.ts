import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { buildDailyReportSnapshot } from "@/lib/daily-report";
import { buildDailyReportHtml } from "@/lib/daily-report-format";
import {
  buildRekapProgressHtml,
  REKAP_DOORS_PER_PAGE,
} from "@/lib/rekap-progress-attachment";
import { parseDateKey } from "@/lib/workday";
import { hasMenu } from "@/lib/menus";

type Params = { params: Promise<{ id: string }> };

/**
 * HTML preview laporan harian (sama dengan tombol Preview di web).
 * `form=1` → pakai nilai form yang belum disimpan (manpower, jam kerja, catatan, blocker).
 */
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

  const url = new URL(req.url);
  const workDate = parseDateKey(url.searchParams.get("date") || "");
  if (!workDate) {
    return NextResponse.json(
      { error: "Format date harus YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const report = await prisma.dailyReport.findUnique({
    where: { projectId_workDate: { projectId: params.id, workDate } },
    select: { id: true },
  });
  const snapshot = report ? await buildDailyReportSnapshot(report.id) : null;
  if (!snapshot) {
    return NextResponse.json(
      { error: "Belum ada laporan untuk tanggal ini" },
      { status: 404 }
    );
  }

  const payload = { ...snapshot };
  if (url.searchParams.get("form") === "1") {
    const manpower = url.searchParams.get("manpower") || "";
    const workHours = url.searchParams.get("workHours") || "";
    const manpowerN = manpower === "" ? snapshot.manpower : parseInt(manpower, 10);
    const workHoursN =
      workHours === "" ? snapshot.workHours : parseFloat(workHours);
    payload.manpower = Number.isFinite(manpowerN as number)
      ? (manpowerN as number)
      : snapshot.manpower;
    payload.workHours = Number.isFinite(workHoursN as number)
      ? (workHoursN as number)
      : snapshot.workHours;
    payload.notes = (url.searchParams.get("notes") || "").trim() || null;
    payload.blocker = (url.searchParams.get("blocker") || "").trim() || null;
  }

  const html = buildDailyReportHtml(payload, {
    projectUrl: `/project/${params.id}/laporan`,
  });
  const floors = snapshot.rekapFloors || [];
  const rekapHtml = floors.length
    ? buildRekapProgressHtml({
        projectName: snapshot.projectName || "Project",
        workDate: snapshot.workDate,
        floors,
      })
    : "";
  const rekapPageCount = floors.reduce(
    (n, f) => n + Math.max(1, Math.ceil(f.markers.length / REKAP_DOORS_PER_PAGE)),
    0
  );

  return NextResponse.json({ html, rekapHtml, rekapPageCount });
}

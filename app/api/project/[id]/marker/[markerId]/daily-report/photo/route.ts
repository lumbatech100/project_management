import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { ensureOpenDailyReport } from "@/lib/daily-report";
import { prisma } from "@/lib/prisma";
import {
  deleteUploadByUrl,
  MAX_EVIDENCE_PHOTOS,
  saveEvidencePhoto,
} from "@/lib/storage";
import { formatDateKey, getActiveWorkDate } from "@/lib/workday";
import { canApproveProgress, canSubmitProgress } from "@/lib/utils";

type Params = { params: Promise<{ id: string; markerId: string }> };

async function getMarker(projectId: string, markerId: string) {
  return prisma.marker.findFirst({
    where: { id: markerId, floor: { projectId } },
  });
}

async function getOrCreateMarkerReport(projectId: string, markerId: string) {
  const workDate = getActiveWorkDate();
  const ensured = await ensureOpenDailyReport(projectId, workDate);
  if (!ensured.ok) {
    return {
      error: `Laporan harian ${formatDateKey(workDate)} sudah ditutup`,
      status: 409 as const,
    };
  }
  let report = await prisma.markerDailyReport.findUnique({
    where: {
      dailyReportId_markerId: {
        dailyReportId: ensured.report.id,
        markerId,
      },
    },
  });
  if (!report) {
    report = await prisma.markerDailyReport.create({
      data: {
        dailyReportId: ensured.report.id,
        markerId,
        status: "DRAFT",
      },
    });
  }
  return { report };
}

/** POST — Leader upload foto bukti blocker */
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
  if (!canSubmitProgress(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const marker = await getMarker(params.id, params.markerId);
  if (!marker) {
    return NextResponse.json({ error: "Marker tidak ditemukan" }, { status: 404 });
  }

  const got = await getOrCreateMarkerReport(params.id, marker.id);
  if ("error" in got) {
    return NextResponse.json({ error: got.error }, { status: got.status });
  }
  const { report } = got;

  if (report.status === "APPROVED") {
    return NextResponse.json(
      { error: "Laporan titik sudah approved" },
      { status: 409 }
    );
  }
  if (report.blockerPhotos.length >= MAX_EVIDENCE_PHOTOS) {
    return NextResponse.json(
      { error: `Maksimal ${MAX_EVIDENCE_PHOTOS} foto blocker` },
      { status: 400 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Upload tidak valid" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "File wajib" }, { status: 400 });
  }

  let url: string;
  try {
    const saved = await saveEvidencePhoto(file, `blocker-${report.id}`);
    url = saved.url;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal upload" },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.markerDailyReport.update({
      where: { id: report.id },
      data: { blockerPhotos: { push: url } },
    });
    return NextResponse.json({ report: updated });
  } catch (err) {
    // DB gagal setelah file sudah tersimpan — hapus lagi supaya tidak nyangkut
    // yatim di disk.
    console.error("[blocker photo] db update failed", err);
    await deleteUploadByUrl(url);
    return NextResponse.json(
      { error: "Gagal menyimpan foto. Coba lagi." },
      { status: 500 }
    );
  }
}

/** DELETE — hapus foto blocker (?url=) */
export async function DELETE(req: NextRequest, props: Params) {
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
  const role = session.user.role;
  const menus = session.user.menus;
  if (!canSubmitProgress(role, menus) && !canApproveProgress(role, menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const marker = await getMarker(params.id, params.markerId);
  if (!marker) {
    return NextResponse.json({ error: "Marker tidak ditemukan" }, { status: 404 });
  }

  const workDate = getActiveWorkDate();
  const daily = await prisma.dailyReport.findUnique({
    where: { projectId_workDate: { projectId: params.id, workDate } },
  });
  if (!daily) {
    return NextResponse.json({ error: "Report tidak ada" }, { status: 404 });
  }

  const report = await prisma.markerDailyReport.findUnique({
    where: {
      dailyReportId_markerId: {
        dailyReportId: daily.id,
        markerId: marker.id,
      },
    },
  });
  if (!report) {
    return NextResponse.json({ error: "Report titik tidak ada" }, { status: 404 });
  }
  if (
    report.status === "APPROVED" &&
    canSubmitProgress(role, menus) &&
    !canApproveProgress(role, menus)
  ) {
    return NextResponse.json({ error: "Sudah approved" }, { status: 409 });
  }

  const url = new URL(req.url).searchParams.get("url");
  if (!url || !report.blockerPhotos.includes(url)) {
    return NextResponse.json({ error: "Foto tidak ditemukan" }, { status: 404 });
  }

  await deleteUploadByUrl(url);
  const updated = await prisma.markerDailyReport.update({
    where: { id: report.id },
    data: { blockerPhotos: report.blockerPhotos.filter((u) => u !== url) },
  });
  return NextResponse.json({ report: updated });
}

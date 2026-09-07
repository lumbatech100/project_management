import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSubmitProgress } from "@/lib/utils";
import { ensureOpenDailyReport } from "@/lib/daily-report";
import { formatDateKey, getActiveWorkDate } from "@/lib/workday";

type Params = { params: { id: string; markerId: string } };

/** Leader: submit checklist item (OPEN → SUBMITTED) untuk approval SM */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canSubmitProgress(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const marker = await prisma.marker.findFirst({
    where: {
      id: params.markerId,
      floor: { projectId: params.id },
    },
  });
  if (!marker) {
    return NextResponse.json({ error: "Marker tidak ditemukan" }, { status: 404 });
  }

  const body = await req.json();
  const itemIds = Array.isArray(body.itemIds)
    ? (body.itemIds as string[]).filter((x) => typeof x === "string")
    : [];

  if (itemIds.length === 0) {
    return NextResponse.json(
      { error: "Pilih minimal 1 pekerjaan untuk di-submit" },
      { status: 400 }
    );
  }

  const workDate = getActiveWorkDate();
  const ensured = await ensureOpenDailyReport(params.id, workDate);
  if (!ensured.ok) {
    return NextResponse.json(
      {
        error: `Laporan harian ${formatDateKey(workDate)} sudah ditutup (cutoff 19:00 WIB)`,
        workDate: formatDateKey(workDate),
      },
      { status: 409 }
    );
  }

  const items = await prisma.breakdownItem.findMany({
    where: {
      id: { in: itemIds },
      markerId: params.markerId,
      status: "OPEN",
    },
  });

  if (items.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada item OPEN yang valid untuk di-submit" },
      { status: 400 }
    );
  }

  const who = session.user.name || session.user.email || "Leader";
  const now = new Date();

  await prisma.breakdownItem.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: {
      status: "SUBMITTED",
      submittedAt: now,
      submittedBy: who,
      done: false,
      doneAt: null,
      doneBy: null,
      workDate,
      dailyReportId: ensured.report.id,
    },
  });

  const updated = await prisma.breakdownItem.findMany({
    where: { id: { in: items.map((i) => i.id) } },
  });

  return NextResponse.json({
    items: updated,
    workDate: formatDateKey(workDate),
    dailyReportId: ensured.report.id,
  });
}

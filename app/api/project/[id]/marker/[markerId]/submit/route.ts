import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canSubmitProgress } from "@/lib/utils";
import { ensureOpenDailyReport } from "@/lib/daily-report";
import { formatDateKey, getActiveWorkDate } from "@/lib/workday";
import { isProgressStep } from "@/lib/progress-steps";

type Params = { params: Promise<{ id: string; markerId: string }> };

/**
 * Leader: submit progress bertahap per item (OPEN → SUBMITTED).
 * Body: { items: [{ id, pct }] } — pct harus 25|50|75|100 dan > progressPct saat ini.
 * Backward-compat: { itemIds: string[] } → dianggap submit 100%.
 */
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
  const submissions: { id: string; pct: number }[] = [];

  if (Array.isArray(body.items)) {
    for (const row of body.items) {
      if (
        row &&
        typeof row.id === "string" &&
        isProgressStep(row.pct)
      ) {
        submissions.push({ id: row.id, pct: row.pct });
      }
    }
  } else if (Array.isArray(body.itemIds)) {
    for (const id of body.itemIds) {
      if (typeof id === "string") submissions.push({ id, pct: 100 });
    }
  }

  if (submissions.length === 0) {
    return NextResponse.json(
      { error: "Pilih minimal 1 pekerjaan + persentase (25/50/75/100)" },
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

  const ids = submissions.map((s) => s.id);
  const items = await prisma.breakdownItem.findMany({
    where: {
      id: { in: ids },
      markerId: params.markerId,
      status: "OPEN",
    },
  });

  const byId = new Map(items.map((i) => [i.id, i]));
  const valid: { id: string; pct: number }[] = [];
  for (const s of submissions) {
    const item = byId.get(s.id);
    if (!item) continue;
    if (item.progressPct >= 100) continue;
    if (s.pct <= item.progressPct) continue;
    valid.push(s);
  }

  if (valid.length === 0) {
    return NextResponse.json(
      {
        error:
          "Tidak ada item valid. Pilih % lebih tinggi dari progress yang sudah di-approve.",
      },
      { status: 400 }
    );
  }

  const who = session.user.name || session.user.email || "Leader";
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const s of valid) {
      const item = byId.get(s.id)!;
      const fromPct = item.progressPct || 0;
      await tx.breakdownItem.update({
        where: { id: s.id },
        data: {
          status: "SUBMITTED",
          submittedPct: s.pct,
          submittedAt: now,
          submittedBy: who,
          done: false,
          doneAt: null,
          doneBy: null,
          workDate,
          dailyReportId: ensured.report.id,
        },
      });
      await tx.breakdownProgressLog.create({
        data: {
          itemId: s.id,
          workDate,
          fromPct,
          toPct: s.pct,
          deltaPct: s.pct - fromPct,
          dailyReportId: ensured.report.id,
          submittedBy: who,
        },
      });
    }
  });

  const updated = await prisma.breakdownItem.findMany({
    where: { id: { in: valid.map((s) => s.id) } },
  });

  return NextResponse.json({
    items: updated,
    workDate: formatDateKey(workDate),
    dailyReportId: ensured.report.id,
  });
}

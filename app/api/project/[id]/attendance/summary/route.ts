import { NextRequest, NextResponse } from "next/server";
import type { AttendanceStatus } from "@prisma/client";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, logAccessDenied } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageAttendance } from "@/lib/attendance";
import { dateOnlyUTC, getJakartaParts } from "@/lib/workday";

type Params = { params: Promise<{ id: string }> };

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
  if (!canManageAttendance(session.user.role, session.user.menus)) {
    logAccessDenied("menu", session.user.id, session.user.role, "project.absen");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = req.nextUrl.searchParams.get("month");
  let year: number;
  let month: number;
  if (raw) {
    const m = /^(\d{4})-(\d{2})$/.exec(raw);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) {
      return NextResponse.json({ error: "Format bulan harus YYYY-MM" }, { status: 400 });
    }
    year = Number(m[1]);
    month = Number(m[2]);
  } else {
    const j = getJakartaParts();
    year = j.year;
    month = j.month;
  }
  const from = dateOnlyUTC(year, month, 1);
  const to = dateOnlyUTC(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1);

  const [counts, workers, groups] = await Promise.all([
    prisma.attendance.groupBy({
      by: ["workerId", "status"],
      where: { projectId: params.id, workDate: { gte: from, lt: to } },
      _count: { _all: true },
    }),
    prisma.worker.findMany({
      where: { projectId: params.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, position: true, groupId: true, active: true },
    }),
    prisma.workerGroup.findMany({
      where: { projectId: params.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  const byWorker = new Map<string, Record<AttendanceStatus, number>>();
  for (const c of counts) {
    const row = byWorker.get(c.workerId) ?? { HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0 };
    row[c.status] = c._count._all;
    byWorker.set(c.workerId, row);
  }

  const groupOrder = new Map(groups.map((g, i) => [g.id, i]));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const orderOf = (groupId: string | null) =>
    (groupId ? groupOrder.get(groupId) : undefined) ?? groups.length;
  const rows = workers
    .filter((w) => w.active || byWorker.has(w.id))
    .sort((a, b) => orderOf(a.groupId) - orderOf(b.groupId))
    .map((w) => ({
      id: w.id,
      name: w.name,
      position: w.position,
      groupName: (w.groupId && groupName.get(w.groupId)) || "Tanpa grup",
      counts: byWorker.get(w.id) ?? { HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0 },
    }));

  return NextResponse.json({
    month: `${year}-${String(month).padStart(2, "0")}`,
    workers: rows,
  });
}

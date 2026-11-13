import { NextRequest, NextResponse } from "next/server";
import type { AttendanceStatus } from "@prisma/client";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, logAccessDenied } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import {
  formatDateKey,
  getJakartaTodayDate,
  parseRecordDate,
} from "@/lib/workday";
import {
  ATTENDANCE_STATUSES,
  ensureLeaderWorkers,
  getAttendanceAccess,
  hasAttendanceAccess,
  isAttendanceStatus,
  type AttendanceAccess,
} from "@/lib/attendance";
import { deleteUploadByUrl, saveEvidencePhoto } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

const MAX_ENTRIES = 500;
const MAX_NOTES = 300;

async function resolveDate(
  raw: unknown,
  projectId: string,
  access: AttendanceAccess
): Promise<{ date: Date; key: string } | { error: string; status: number }> {
  const today = getJakartaTodayDate();
  const todayKey = formatDateKey(today);
  if (raw === undefined || raw === null || raw === "" || raw === todayKey) {
    return { date: today, key: todayKey };
  }
  if (typeof raw !== "string") {
    return { error: "Format tanggal harus YYYY-MM-DD", status: 400 };
  }
  if (!access.canManage) {
    const subcon = access.leaderGroupIds.length
      ? await prisma.workerGroup.count({
          where: {
            id: { in: access.leaderGroupIds },
            kind: { not: "INTERNAL" },
          },
        })
      : 0;
    if (!subcon) {
      return { error: "Hanya bisa absen untuk hari ini", status: 403 };
    }
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { createdAt: true },
  });
  if (!project) return { error: "Not found", status: 404 };
  const parsed = parseRecordDate(raw, project.createdAt);
  if ("error" in parsed) return { error: parsed.error, status: 400 };
  return { date: parsed.date, key: raw };
}

async function loadContext(req: NextRequest, projectId: string) {
  const session = await getApiSession(req);
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }
  const denied = await forbidUnlessProjectAccess(
    session.user.id,
    session.user.role,
    projectId
  );
  if (denied) return { error: denied } as const;
  const access = await getAttendanceAccess(session.user, projectId);
  if (!hasAttendanceAccess(access)) {
    logAccessDenied("menu", session.user.id, session.user.role, "project.absen");
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }
  return { user: session.user, access } as const;
}

export async function GET(req: NextRequest, props: Params) {
  const params = await props.params;
  const ctx = await loadContext(req, params.id);
  if ("error" in ctx) return ctx.error;
  const { access } = ctx;

  const resolved = await resolveDate(
    req.nextUrl.searchParams.get("date"),
    params.id,
    access
  );
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { date, key } = resolved;

  const groupFilter = access.canManage
    ? {}
    : { id: { in: access.leaderGroupIds } };

  const groups = await prisma.workerGroup.findMany({
    where: { projectId: params.id, ...groupFilter },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      kind: true,
      leaders: { select: { user: { select: { id: true, name: true } } } },
    },
  });
  await ensureLeaderWorkers(
    params.id,
    groups.filter((g) => g.kind !== "INTERNAL").map((g) => g.id)
  );

  const [workers, sheets] = await Promise.all([
    prisma.worker.findMany({
      where: {
        projectId: params.id,
        AND: [
          { OR: [{ active: true }, { attendances: { some: { workDate: date } } }] },
          ...(access.canManage
            ? []
            : [
                {
                  OR: [
                    { groupId: { in: access.leaderGroupIds }, active: true },
                    ...(access.selfWorkerId ? [{ id: access.selfWorkerId }] : []),
                  ],
                },
              ]),
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        position: true,
        groupId: true,
        active: true,
        attendances: {
          where: { workDate: date },
          select: {
            status: true,
            notes: true,
            recordedBy: true,
            recordedById: true,
            updatedAt: true,
          },
        },
      },
    }),
    prisma.attendanceSheet.findMany({
      where: { projectId: params.id, workDate: date },
      select: { groupId: true, photoUrls: true, submittedBy: true, updatedAt: true },
    }),
  ]);

  const rows = workers.map((w) => ({
    id: w.id,
    name: w.name,
    position: w.position,
    groupId: w.groupId,
    active: w.active,
    record: w.attendances[0] ?? null,
  }));

  const groupIds = new Set(groups.map((g) => g.id));
  const sheetByGroup = new Map(sheets.map((s) => [s.groupId, s]));
  const outGroups = groups.map((g) => ({
    id: g.id,
    name: g.name,
    kind: g.kind,
    leaders: g.leaders.map((l) => l.user),
    sheet: sheetByGroup.get(g.id) ?? null,
    workers: rows.filter((r) => r.groupId === g.id),
  }));
  if (access.canManage) {
    const ungrouped = rows.filter((r) => !r.groupId || !groupIds.has(r.groupId));
    if (ungrouped.length) {
      outGroups.push({
        id: "ungrouped",
        name: "Tanpa grup",
        kind: "CUSTOM",
        leaders: [],
        sheet: null,
        workers: ungrouped,
      });
    }
  }

  const totals: Record<AttendanceStatus | "BELUM", number> = {
    HADIR: 0,
    IZIN: 0,
    SAKIT: 0,
    ALPA: 0,
    BELUM: 0,
  };
  for (const g of outGroups) {
    for (const r of g.workers) {
      totals[r.record?.status ?? "BELUM"] += 1;
    }
  }

  return NextResponse.json({
    date: key,
    today: formatDateKey(getJakartaTodayDate()),
    canManage: access.canManage,
    self:
      access.canManage || !access.selfWorkerId
        ? null
        : rows.find((r) => r.id === access.selfWorkerId) ?? null,
    groups: outGroups,
    totals,
    statuses: ATTENDANCE_STATUSES,
  });
}

export async function PUT(req: NextRequest, props: Params) {
  const params = await props.params;
  const ctx = await loadContext(req, params.id);
  if ("error" in ctx) return ctx.error;
  const { access, user } = ctx;

  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    return submitGroupSheet(req, params.id, access, user);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const resolved = await resolveDate(body.date, params.id, access);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { date, key } = resolved;

  if (
    !Array.isArray(body.entries) ||
    body.entries.length === 0 ||
    body.entries.length > MAX_ENTRIES
  ) {
    return NextResponse.json({ error: "Daftar absen kosong / tidak valid" }, { status: 400 });
  }

  type Entry = { workerId: string; status: AttendanceStatus | null; notes: string | null };
  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (const raw of body.entries as unknown[]) {
    const e = raw as { workerId?: unknown; status?: unknown; notes?: unknown };
    if (!e || typeof e.workerId !== "string" || seen.has(e.workerId)) {
      return NextResponse.json({ error: "Pekerja tidak valid" }, { status: 400 });
    }
    if (e.status !== null && !isAttendanceStatus(e.status)) {
      return NextResponse.json(
        { error: "Status harus Hadir, Izin, Sakit, atau Alpa" },
        { status: 400 }
      );
    }
    if (e.notes !== undefined && e.notes !== null && typeof e.notes !== "string") {
      return NextResponse.json({ error: "Catatan tidak valid" }, { status: 400 });
    }
    const notes = typeof e.notes === "string" ? e.notes.trim() : "";
    if (notes.length > MAX_NOTES) {
      return NextResponse.json(
        { error: `Catatan maks ${MAX_NOTES} karakter` },
        { status: 400 }
      );
    }
    seen.add(e.workerId);
    entries.push({ workerId: e.workerId, status: e.status, notes: notes || null });
  }

  const workers = await prisma.worker.findMany({
    where: { projectId: params.id, id: { in: entries.map((e) => e.workerId) } },
    select: { id: true, groupId: true, active: true },
  });
  if (workers.length !== entries.length) {
    return NextResponse.json({ error: "Pekerja tidak ditemukan di project ini" }, { status: 400 });
  }

  if (!access.canManage) {
    const leaderGroups = new Set(access.leaderGroupIds);
    const allowed = workers.every(
      (w) =>
        w.id === access.selfWorkerId ||
        (w.active && w.groupId !== null && leaderGroups.has(w.groupId))
    );
    if (!allowed) {
      logAccessDenied("menu", user.id, user.role, `attendance:${params.id}`);
      return NextResponse.json(
        { error: "Anda hanya bisa absen diri sendiri / anggota grup Anda" },
        { status: 403 }
      );
    }
  }

  await prisma.$transaction(
    entries.map((e) =>
      e.status === null
        ? prisma.attendance.deleteMany({
            where: { workerId: e.workerId, workDate: date },
          })
        : prisma.attendance.upsert({
            where: { workerId_workDate: { workerId: e.workerId, workDate: date } },
            create: {
              projectId: params.id,
              workerId: e.workerId,
              workDate: date,
              status: e.status,
              notes: e.notes,
              recordedById: user.id,
              recordedBy: user.name ?? null,
            },
            update: {
              status: e.status,
              notes: e.notes,
              recordedById: user.id,
              recordedBy: user.name ?? null,
            },
          })
    )
  );

  return NextResponse.json({ ok: true, date: key, saved: entries.length });
}

/** Leader submit satu grup: foto selfie wajib, yang tidak hadir wajib ada keterangan. */
async function submitGroupSheet(
  req: NextRequest,
  projectId: string,
  access: AttendanceAccess,
  user: { id: string; name?: string | null }
) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Upload tidak valid" }, { status: 400 });
  }

  const groupId = String(form.get("groupId") || "");
  if (!groupId || groupId === "ungrouped") {
    return NextResponse.json({ error: "Grup tidak valid" }, { status: 400 });
  }
  const resolved = await resolveDate(form.get("date"), projectId, access);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const group = await prisma.workerGroup.findFirst({
    where: { id: groupId, projectId },
    select: { id: true, kind: true },
  });
  if (!group) return NextResponse.json({ error: "Grup tidak ditemukan" }, { status: 404 });
  if (group.kind !== "INTERNAL") {
    await ensureLeaderWorkers(projectId, [group.id]);
  }
  if (group.kind === "INTERNAL") {
    return NextResponse.json(
      { error: "Grup Internal absen sendiri, tidak lewat submit grup" },
      { status: 400 }
    );
  }
  if (!access.canManage && !access.leaderGroupIds.includes(group.id)) {
    return NextResponse.json({ error: "Anda bukan leader grup ini" }, { status: 403 });
  }

  let rawEntries: unknown;
  try {
    rawEntries = JSON.parse(String(form.get("entries") || "[]"));
  } catch {
    return NextResponse.json({ error: "Daftar absen tidak valid" }, { status: 400 });
  }
  if (!Array.isArray(rawEntries)) {
    return NextResponse.json({ error: "Daftar absen tidak valid" }, { status: 400 });
  }

  const workers = await prisma.worker.findMany({
    where: { projectId, groupId: group.id, active: true },
    select: { id: true, name: true },
  });
  if (workers.length === 0) {
    return NextResponse.json({ error: "Belum ada pekerja di grup ini" }, { status: 400 });
  }

  const byId = new Map<string, { present: boolean; notes: string | null }>();
  for (const raw of rawEntries) {
    const item = raw as { workerId?: unknown; present?: unknown; notes?: unknown };
    if (!item || typeof item.workerId !== "string" || byId.has(item.workerId)) {
      return NextResponse.json({ error: "Pekerja tidak valid" }, { status: 400 });
    }
    const notes = typeof item.notes === "string" ? item.notes.trim() : "";
    if (notes.length > MAX_NOTES) {
      return NextResponse.json({ error: `Keterangan maks ${MAX_NOTES} karakter` }, { status: 400 });
    }
    byId.set(item.workerId, { present: item.present === true, notes: notes || null });
  }
  for (const w of workers) {
    const row = byId.get(w.id);
    if (!row) {
      return NextResponse.json({ error: `Absen ${w.name} belum diisi` }, { status: 400 });
    }
    if (!row.present && !row.notes) {
      return NextResponse.json(
        { error: `${w.name} tidak hadir, keterangan wajib diisi` },
        { status: 400 }
      );
    }
  }

  const files = form
    .getAll("photo")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const existing = await prisma.attendanceSheet.findUnique({
    where: { groupId_workDate: { groupId: group.id, workDate: resolved.date } },
  });
  if (files.length === 0 && !existing?.photoUrls.length) {
    return NextResponse.json(
      { error: "Foto selfie bersama pekerja wajib diunggah" },
      { status: 400 }
    );
  }

  const photoUrls: string[] = [];
  try {
    for (const file of files) {
      const saved = await saveEvidencePhoto(file, `absen-${projectId}`);
      photoUrls.push(saved.url);
    }
  } catch (err) {
    await Promise.all(photoUrls.map((u) => deleteUploadByUrl(u)));
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal simpan foto" },
      { status: 400 }
    );
  }

  const who = user.name || "User";
  try {
    await prisma.$transaction(async (tx) => {
      await tx.attendanceSheet.upsert({
        where: { groupId_workDate: { groupId: group.id, workDate: resolved.date } },
        create: {
          projectId,
          groupId: group.id,
          workDate: resolved.date,
          photoUrls: photoUrls.length ? photoUrls : existing?.photoUrls ?? [],
          submittedById: user.id,
          submittedBy: who,
        },
        update: {
          ...(photoUrls.length ? { photoUrls } : {}),
          submittedById: user.id,
          submittedBy: who,
        },
      });
      for (const w of workers) {
        const row = byId.get(w.id)!;
        await tx.attendance.upsert({
          where: { workerId_workDate: { workerId: w.id, workDate: resolved.date } },
          create: {
            projectId,
            workerId: w.id,
            workDate: resolved.date,
            status: row.present ? "HADIR" : "ALPA",
            notes: row.present ? null : row.notes,
            recordedById: user.id,
            recordedBy: who,
          },
          update: {
            status: row.present ? "HADIR" : "ALPA",
            notes: row.present ? null : row.notes,
            recordedById: user.id,
            recordedBy: who,
          },
        });
      }
    });
  } catch (err) {
    await Promise.all(photoUrls.map((u) => deleteUploadByUrl(u)));
    throw err;
  }
  if (photoUrls.length && existing?.photoUrls.length) {
    await Promise.all(existing.photoUrls.map((u) => deleteUploadByUrl(u)));
  }

  return NextResponse.json({ ok: true, date: resolved.key, saved: workers.length });
}

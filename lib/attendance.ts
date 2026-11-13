import type { AttendanceStatus, Role } from "@prisma/client";
import { prisma } from "./prisma";
import { hasMenu } from "./menus";

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "HADIR",
  "IZIN",
  "SAKIT",
  "ALPA",
];

export function isAttendanceStatus(v: unknown): v is AttendanceStatus {
  return (
    typeof v === "string" &&
    (ATTENDANCE_STATUSES as string[]).includes(v)
  );
}

/** Rekap & koreksi absen semua grup (semua tanggal): Admin/PM/SM, atau menu Absen. */
export function canManageAttendance(role: Role, menus?: string[] | null) {
  if (role === "CLIENT") return false;
  if (role === "ADMIN" || role === "PM" || role === "SM") return true;
  return hasMenu(menus, "project.absen");
}

export type AttendanceAccess = {
  canManage: boolean;
  /** Grup worker yang diabsen user ini sebagai Leader */
  leaderGroupIds: string[];
  /** Data pekerja Internal milik user ini (absen mandiri) */
  selfWorkerId: string | null;
};

export async function getAttendanceAccess(
  user: { id: string; role: Role; menus?: string[] | null },
  projectId: string
): Promise<AttendanceAccess> {
  if (user.role === "CLIENT") {
    return { canManage: false, leaderGroupIds: [], selfWorkerId: null };
  }
  const canManage = canManageAttendance(user.role, user.menus);
  const [leaderOf, self] = await Promise.all([
    prisma.workerGroupLeader.findMany({
      where: {
        userId: user.id,
        group: { projectId, kind: { not: "INTERNAL" } },
      },
      select: { groupId: true },
    }),
    canManage
      ? Promise.resolve(null)
      : prisma.worker.findFirst({
          where: {
            projectId,
            userId: user.id,
            active: true,
            group: { kind: "INTERNAL" },
          },
          select: { id: true },
        }),
  ]);
  return {
    canManage,
    leaderGroupIds: canManage ? [] : leaderOf.map((l) => l.groupId),
    selfWorkerId: self?.id ?? null,
  };
}

export function hasAttendanceAccess(a: AttendanceAccess) {
  return a.canManage || a.leaderGroupIds.length > 0 || !!a.selfWorkerId;
}

/**
 * Leader grup ikut dicentang di absen, jadi harus ada baris pekerja di grup itu.
 * Pekerja yang sudah ada (akun yang sama) tidak dipindah dari grup lain.
 */
export async function ensureLeaderWorkers(projectId: string, groupIds: string[]) {
  const ids = groupIds.filter((id) => id && id !== "ungrouped");
  if (!ids.length) return;
  const leaders = await prisma.workerGroupLeader.findMany({
    where: {
      groupId: { in: ids },
      group: { projectId, kind: { not: "INTERNAL" } },
    },
    select: {
      groupId: true,
      user: { select: { id: true, name: true } },
    },
  });
  for (const leader of leaders) {
    const existing = await prisma.worker.findUnique({
      where: { projectId_userId: { projectId, userId: leader.user.id } },
      select: { id: true, groupId: true },
    });
    if (!existing) {
      await prisma.worker.create({
        data: {
          projectId,
          groupId: leader.groupId,
          userId: leader.user.id,
          name: leader.user.name,
          position: "Leader",
          sortOrder: -1,
          active: true,
        },
      });
      continue;
    }
    if (existing.groupId == null) {
      await prisma.worker.update({
        where: { id: existing.id },
        data: { groupId: leader.groupId },
      });
    }
  }
}

/** Jumlah pekerja berstatus Hadir pada tanggal kerja (untuk Laporan Harian). */
export function countPresent(projectId: string, workDate: Date) {
  return prisma.attendance.count({
    where: { projectId, workDate, status: "HADIR" },
  });
}

/** User yang boleh jadi Leader grup / akun absen Internal: member project non-Client. */
export async function projectStaffUsers(projectId: string) {
  const members = await prisma.projectMember.findMany({
    where: { projectId, user: { role: { notIn: ["CLIENT", "ADMIN"] } } },
    select: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { user: { name: "asc" } },
  });
  return members.map((m) => m.user);
}

export async function isProjectStaff(projectId: string, userId: string) {
  const m = await prisma.projectMember.findFirst({
    where: { projectId, userId, user: { role: { notIn: ["CLIENT", "ADMIN"] } } },
    select: { id: true },
  });
  return !!m;
}

/**
 * Validasi akun login untuk pekerja (hanya grup Internal).
 * `undefined` = tidak diubah, `null` = lepas tautan.
 */
export async function resolveWorkerUserId(opts: {
  projectId: string;
  raw: unknown;
  groupKind: string | null;
  workerId?: string;
}): Promise<{ userId: string | null | undefined } | { error: string }> {
  const { projectId, raw, groupKind, workerId } = opts;
  if (raw === undefined) return { userId: undefined };
  if (raw === null || raw === "") return { userId: null };
  if (typeof raw !== "string") return { error: "Akun login tidak valid" };
  if (groupKind !== "INTERNAL") {
    return { error: "Akun login hanya untuk pekerja grup Internal" };
  }
  if (!(await isProjectStaff(projectId, raw))) {
    return { error: "Akun harus member project (bukan Client)" };
  }
  const linked = await prisma.user.findUnique({
    where: { id: raw },
    select: { role: true },
  });
  if (
    linked &&
    (linked.role === "ADMIN" || linked.role === "PM" || linked.role === "SM")
  ) {
    return { error: "Admin/PM/SM tidak absen mandiri — mereka kelola laporan absensi" };
  }
  const taken = await prisma.worker.findFirst({
    where: { projectId, userId: raw, ...(workerId ? { id: { not: workerId } } : {}) },
    select: { name: true },
  });
  if (taken) {
    return { error: `Akun sudah ditautkan ke pekerja "${taken.name}"` };
  }
  return { userId: raw };
}

import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasMenu, type MenuKey } from "@/lib/menus";

/** Hanya Admin yang melihat semua project; role lain wajib jadi member project. */
export function seesAllProjects(role: Role) {
  return role === "ADMIN";
}

export function isClientRole(role: Role) {
  return role === "CLIENT";
}

/** Siapa yang boleh assign member ke project */
export function canManageProjectMembers(
  role: Role,
  menus?: string[] | null
) {
  if (role === "ADMIN" || role === "PM") return true;
  if (isClientRole(role)) return false;
  return hasMenu(menus, "project.details");
}

export async function canAccessProject(
  userId: string,
  role: Role,
  projectId: string
): Promise<boolean> {
  if (seesAllProjects(role)) return true;
  const member = await prisma.projectMember.findUnique({
    where: {
      projectId_userId: { projectId, userId },
    },
    select: { id: true },
  });
  return !!member;
}

/** Filter Prisma `where` untuk list project */
export function projectListWhere(userId: string, role: Role) {
  if (seesAllProjects(role)) return {};
  return {
    members: { some: { userId } },
  };
}

export function logAccessDenied(
  kind: "project" | "menu" | "file",
  userId: string,
  role: Role,
  target: string
) {
  console.warn(
    `[access-denied] kind=${kind} user=${userId} role=${role} target=${target}`
  );
}

/**
 * Untuk API route: return NextResponse error jika tidak berhak, else null.
 */
export async function forbidUnlessProjectAccess(
  userId: string,
  role: Role,
  projectId: string
): Promise<NextResponse | null> {
  const ok = await canAccessProject(userId, role, projectId);
  if (ok) return null;
  logAccessDenied("project", userId, role, projectId);
  return NextResponse.json(
    { error: "Anda tidak punya akses ke project ini" },
    { status: 403 }
  );
}

/**
 * Baca data fitur project: Admin selalu boleh, role lain wajib punya salah satu menu.
 * Menu sudah dinormalisasi dari DB (default per role bila kosong).
 */
export function forbidUnlessMenu(
  user: { id: string; role: Role; menus?: string[] | null },
  ...keys: MenuKey[]
): NextResponse | null {
  if (user.role === "ADMIN") return null;
  if (keys.some((k) => hasMenu(user.menus, k))) return null;
  logAccessDenied("menu", user.id, user.role, keys.join("|"));
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

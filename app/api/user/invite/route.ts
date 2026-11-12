import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/utils";
import { defaultMenusForRole, normalizeMenus } from "@/lib/menus";
import {
  inviteExpiry,
  isValidEmail,
  newUserInviteToken,
  normalizeEmail,
  userInvitePath,
} from "@/lib/user-invites";

const inviteSelect = {
  id: true,
  token: true,
  name: true,
  email: true,
  role: true,
  projectIds: true,
  expiresAt: true,
  createdAt: true,
} as const;

async function withProjectNames<
  T extends { projectIds: string[]; token: string },
>(invites: T[]) {
  const ids = Array.from(new Set(invites.flatMap((i) => i.projectIds)));
  const projects = ids.length
    ? await prisma.project.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  return invites.map(({ token, ...i }) => ({
    ...i,
    invitePath: userInvitePath(token),
    projects: i.projectIds
      .filter((id) => nameById.has(id))
      .map((id) => ({ id, name: nameById.get(id)! })),
  }));
}

export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invites = await prisma.userInvite.findMany({
    where: { acceptedAt: null },
    select: inviteSelect,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(await withProjectNames(invites));
}

export async function POST(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    projectIds?: unknown;
  };
  const name = body.name?.trim() || "";
  const email = normalizeEmail(body.email || "");
  if (!name || !email) {
    return NextResponse.json(
      { error: "Nama dan email wajib diisi" },
      { status: 400 }
    );
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Format email tidak valid" }, { status: 400 });
  }

  const exists = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (exists) {
    return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 400 });
  }

  const requestedIds = Array.isArray(body.projectIds)
    ? body.projectIds.filter((v): v is string => typeof v === "string")
    : [];
  const projects = requestedIds.length
    ? await prisma.project.findMany({
        where: { id: { in: requestedIds } },
        select: { id: true },
      })
    : [];
  const projectIds = projects.map((p) => p.id);
  if (projectIds.length === 0) {
    return NextResponse.json(
      { error: "Pilih minimal 1 project untuk client" },
      { status: 400 }
    );
  }

  const data = {
    token: newUserInviteToken(),
    name,
    email,
    role: "CLIENT" as const,
    menus: normalizeMenus(defaultMenusForRole("CLIENT"), "CLIENT"),
    projectIds,
    expiresAt: inviteExpiry(),
    createdById: session.user.id,
  };

  // Satu undangan aktif per email: undang ulang = ganti link lama.
  const pending = await prisma.userInvite.findFirst({
    where: { email, acceptedAt: null },
    select: { id: true },
  });
  const invite = pending
    ? await prisma.userInvite.update({
        where: { id: pending.id },
        data,
        select: inviteSelect,
      })
    : await prisma.userInvite.create({ data, select: inviteSelect });

  const [result] = await withProjectNames([invite]);
  return NextResponse.json(result, { status: 201 });
}

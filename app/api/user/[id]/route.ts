import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { getApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/utils";
import { normalizeMenus } from "@/lib/menus";
import { MIN_PASSWORD_LENGTH } from "@/lib/user-invites";
import { revokeUserSessions } from "@/lib/auth-session";
import type { Role } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const ROLES: Role[] = ["ADMIN", "PM", "SM", "LEADER", "CLIENT"];

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  menus: true,
  createdAt: true,
} as const;

export async function PUT(req: NextRequest, props: Params) {
  const params = await props.params;
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const name =
    typeof body.name === "string" ? body.name.trim() : existing.name;
  const email =
    typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : existing.email;
  const role: Role = ROLES.includes(body.role) ? body.role : existing.role;
  const password =
    typeof body.password === "string" && body.password.length > 0
      ? body.password
      : null;
  const menus =
    body.menus !== undefined
      ? normalizeMenus(body.menus, role)
      : normalizeMenus(existing.menus, role);

  if (!name || !email) {
    return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 });
  }
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password minimal ${MIN_PASSWORD_LENGTH} karakter` },
      { status: 400 }
    );
  }

  if (session.user.role !== "ADMIN") {
    if (existing.role === "ADMIN" || role === "ADMIN") {
      return NextResponse.json(
        { error: "Hanya Admin yang bisa mengubah akun / role Admin" },
        { status: 403 }
      );
    }
    const currentMenus = normalizeMenus(existing.menus, existing.role);
    const sameMenus =
      menus.length === currentMenus.length &&
      menus.every((m) => currentMenus.includes(m));
    if (existing.id === session.user.id && (role !== existing.role || !sameMenus)) {
      return NextResponse.json(
        { error: "Tidak bisa mengubah role / hak akses akun sendiri" },
        { status: 403 }
      );
    }
  }

  if (email !== existing.email) {
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken) {
      return NextResponse.json(
        { error: "Email sudah terdaftar" },
        { status: 400 }
      );
    }
  }

  if (existing.role === "ADMIN" && role !== "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Tidak bisa mengubah role admin terakhir" },
        { status: 400 }
      );
    }
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: {
      name,
      email,
      role,
      menus,
      ...(password ? { password: await hash(password, 10) } : {}),
    },
    select: userSelect,
  });

  if (password || role !== existing.role || email !== existing.email) {
    await revokeUserSessions(existing.id);
  }

  return NextResponse.json({
    ...user,
    menus: normalizeMenus(user.menus, user.role),
  });
}

export async function DELETE(req: NextRequest, props: Params) {
  const params = await props.params;
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.user.id === params.id) {
    return NextResponse.json(
      { error: "Tidak bisa menghapus akun sendiri" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.role === "ADMIN" && session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Hanya Admin yang bisa menghapus akun Admin" },
      { status: 403 }
    );
  }

  if (existing.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Tidak bisa menghapus admin terakhir" },
        { status: 400 }
      );
    }
  }

  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

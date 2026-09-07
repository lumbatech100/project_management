import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { hash } from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/utils";
import { normalizeMenus } from "@/lib/menus";
import type { Role } from "@prisma/client";

type Params = { params: { id: string } };

const ROLES: Role[] = ["ADMIN", "PM", "SM", "LEADER"];

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  menus: true,
  createdAt: true,
} as const;

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
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

  return NextResponse.json({
    ...user,
    menus: normalizeMenus(user.menus, user.role),
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
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

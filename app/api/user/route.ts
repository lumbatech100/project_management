import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { getApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/utils";
import { defaultMenusForRole, normalizeMenus } from "@/lib/menus";
import { MIN_PASSWORD_LENGTH } from "@/lib/user-invites";
import type { Role } from "@prisma/client";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  menus: true,
  createdAt: true,
} as const;

export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: userSelect,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    users.map((u) => ({
      ...u,
      menus: normalizeMenus(u.menus, u.role),
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, role } = body as {
    name: string;
    email: string;
    password: string;
    role: Role;
  };

  if (!name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password minimal ${MIN_PASSWORD_LENGTH} karakter` },
      { status: 400 }
    );
  }

  const exists = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (exists) {
    return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 400 });
  }

  const resolvedRole: Role = role || "LEADER";
  const allowed: Role[] = ["ADMIN", "PM", "SM", "LEADER", "CLIENT"];
  if (!allowed.includes(resolvedRole)) {
    return NextResponse.json({ error: "Role tidak valid" }, { status: 400 });
  }
  if (resolvedRole === "ADMIN" && session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Hanya Admin yang bisa membuat akun Admin" },
      { status: 403 }
    );
  }
  const menus = normalizeMenus(
    body.menus ?? defaultMenusForRole(resolvedRole),
    resolvedRole
  );

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: await hash(password, 10),
      role: resolvedRole,
      menus,
    },
    select: userSelect,
  });

  return NextResponse.json(
    { ...user, menus: normalizeMenus(user.menus, user.role) },
    { status: 201 }
  );
}

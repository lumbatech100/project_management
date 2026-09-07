import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { hash } from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/utils";
import { defaultMenusForRole, normalizeMenus } from "@/lib/menus";
import type { Role } from "@prisma/client";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  menus: true,
  createdAt: true,
} as const;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
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
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
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

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 400 });
  }

  const resolvedRole: Role = role || "LEADER";
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

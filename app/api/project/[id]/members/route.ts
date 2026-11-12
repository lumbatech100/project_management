import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import {
  canManageProjectMembers,
  forbidUnlessProjectAccess,
} from "@/lib/project-access";

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
  if (!canManageProjectMembers(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await prisma.projectMember.findMany({
    where: { projectId: params.id },
    orderBy: { id: "asc" },
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });

  const memberIds = new Set(members.map((m) => m.userId));
  const candidates = await prisma.user.findMany({
    where: { role: { not: "ADMIN" } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      user: m.user,
    })),
    candidates: candidates.filter((u) => !memberIds.has(u.id)),
  });
}

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
  if (!canManageProjectMembers(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) {
    return NextResponse.json({ error: "userId wajib" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (user.role === "ADMIN") {
    return NextResponse.json(
      { error: "Admin otomatis punya akses ke semua project" },
      { status: 400 }
    );
  }

  const member = await prisma.projectMember.upsert({
    where: {
      projectId_userId: { projectId: params.id, userId },
    },
    create: {
      projectId: params.id,
      userId,
      role: user.role,
    },
    update: {
      role: user.role,
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  });

  return NextResponse.json(
    { id: member.id, role: member.role, user: member.user },
    { status: 201 }
  );
}

export async function DELETE(req: NextRequest, props: Params) {
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
  if (!canManageProjectMembers(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) {
    return NextResponse.json({ error: "userId wajib" }, { status: 400 });
  }

  await prisma.projectMember.deleteMany({
    where: { projectId: params.id, userId },
  });

  return NextResponse.json({ ok: true });
}

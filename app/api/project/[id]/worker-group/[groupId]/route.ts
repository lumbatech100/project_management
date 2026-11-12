import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageWorkers } from "@/lib/utils";
import { GROUP_LEADERS_INCLUDE, newInviteToken } from "@/lib/worker-groups";
import { projectStaffUsers } from "@/lib/attendance";

type Params = { params: Promise<{ id: string; groupId: string }> };

export async function PUT(req: NextRequest, props: Params) {
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
  if (!canManageWorkers(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.workerGroup.findFirst({
    where: { id: params.groupId, projectId: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const name =
    typeof body.name === "string" ? body.name.trim() : existing.name;
  if (!name) {
    return NextResponse.json({ error: "Nama grup wajib" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "Nama grup maks 80 karakter" }, { status: 400 });
  }

  const data: {
    name: string;
    inviteEnabled?: boolean;
    inviteToken?: string;
  } = { name };

  if (typeof body.inviteEnabled === "boolean") {
    data.inviteEnabled = body.inviteEnabled;
  }
  if (body.rotateInvite === true) {
    data.inviteToken = newInviteToken();
    data.inviteEnabled = true;
  } else if (!existing.inviteToken) {
    data.inviteToken = newInviteToken();
  }

  let leaderUserIds: string[] | null = null;
  if (body.leaderUserIds !== undefined) {
    if (existing.kind === "INTERNAL") {
      return NextResponse.json(
        { error: "Grup Internal absen sendiri, tidak pakai Leader" },
        { status: 400 }
      );
    }
    if (
      !Array.isArray(body.leaderUserIds) ||
      body.leaderUserIds.length > 20 ||
      body.leaderUserIds.some((v: unknown) => typeof v !== "string")
    ) {
      return NextResponse.json({ error: "Daftar Leader tidak valid" }, { status: 400 });
    }
    leaderUserIds = Array.from(new Set<string>(body.leaderUserIds));
    const staffIds = new Set((await projectStaffUsers(params.id)).map((u) => u.id));
    if (leaderUserIds.some((id) => !staffIds.has(id))) {
      return NextResponse.json(
        { error: "Leader harus member project (bukan Client)" },
        { status: 400 }
      );
    }
  }

  const group = await prisma.$transaction(async (tx) => {
    if (leaderUserIds) {
      await tx.workerGroupLeader.deleteMany({
        where: { groupId: existing.id, userId: { notIn: leaderUserIds } },
      });
      for (const userId of leaderUserIds) {
        await tx.workerGroupLeader.upsert({
          where: { groupId_userId: { groupId: existing.id, userId } },
          create: { groupId: existing.id, userId },
          update: {},
        });
      }
    }
    return tx.workerGroup.update({
      where: { id: existing.id },
      data,
      include: GROUP_LEADERS_INCLUDE,
    });
  });

  const { leaders, ...rest } = group;
  return NextResponse.json({
    ...rest,
    leaders: leaders.map((l) => l.user),
    invitePath: group.inviteToken
      ? `/isi-data/grup/${group.inviteToken}`
      : null,
  });
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
  if (!canManageWorkers(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.workerGroup.findFirst({
    where: { id: params.groupId, projectId: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.kind === "INTERNAL") {
    return NextResponse.json(
      { error: "Grup Internal tidak bisa dihapus" },
      { status: 400 }
    );
  }

  await prisma.worker.updateMany({
    where: { groupId: params.groupId },
    data: { groupId: null },
  });
  await prisma.workerGroup.delete({ where: { id: params.groupId } });

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, forbidUnlessMenu } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageWorkers } from "@/lib/utils";
import { ensureDefaultWorkerGroups, newInviteToken } from "@/lib/worker-groups";

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
  const noMenu = forbidUnlessMenu(session.user, "project.pekerja");
  if (noMenu) return noMenu;

  const groups = await ensureDefaultWorkerGroups(params.id);
  return NextResponse.json(groups);
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
  if (!canManageWorkers(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Nama grup wajib" }, { status: 400 });
  }

  if (name.length > 80) {
    return NextResponse.json({ error: "Nama grup maks 80 karakter" }, { status: 400 });
  }

  const maxSort = await prisma.workerGroup.aggregate({
    where: { projectId: params.id },
    _max: { sortOrder: true },
  });

  const group = await prisma.workerGroup.create({
    data: {
      projectId: params.id,
      name,
      kind: "CUSTOM",
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      inviteToken: newInviteToken(),
      inviteEnabled: true,
    },
  });

  return NextResponse.json({
    ...group,
    leaders: [],
    invitePath: `/isi-data/grup/${group.inviteToken}`,
  });
}

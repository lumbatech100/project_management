import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, forbidUnlessMenu } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageWorkers } from "@/lib/utils";
import { newInviteToken } from "@/lib/worker-groups";
import { resolveWorkerUserId } from "@/lib/attendance";
import {
  DEFAULT_WORKER_POSITION,
  isWorkerPosition,
} from "@/lib/worker-positions";
import {
  WorkerFieldError,
  parseWorkerProfile,
  workerNameOrThrow,
  type WorkerProfileFields,
} from "@/lib/worker-validation";

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

  const workers = await prisma.worker.findMany({
    where: { projectId: params.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      group: { select: { id: true, name: true, kind: true } },
    },
  });

  return NextResponse.json(workers);
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
  const asInvite = body.asInvite === true;
  let profile: WorkerProfileFields;
  let rawName: string | null;
  try {
    profile = parseWorkerProfile(body);
    rawName = workerNameOrThrow(body.name);
  } catch (err) {
    if (err instanceof WorkerFieldError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
  const name = rawName || (asInvite ? "Belum diisi" : "");
  const rawPos =
    typeof body.position === "string" ? body.position.trim() : "";
  const position = isWorkerPosition(rawPos)
    ? rawPos
    : DEFAULT_WORKER_POSITION;

  if (!asInvite && !name) {
    return NextResponse.json({ error: "Nama wajib" }, { status: 400 });
  }
  if (rawPos && !isWorkerPosition(rawPos)) {
    return NextResponse.json(
      { error: "Jabatan wajib: PM, SM, Leader, Worker, atau HSE" },
      { status: 400 }
    );
  }

  const groupId: string | null =
    typeof body.groupId === "string" && body.groupId ? body.groupId : null;
  let groupKind: string | null = null;
  if (groupId) {
    const g = await prisma.workerGroup.findFirst({
      where: { id: groupId, projectId: params.id },
    });
    if (!g) {
      return NextResponse.json({ error: "Grup tidak valid" }, { status: 400 });
    }
    groupKind = g.kind;
  }

  const link = await resolveWorkerUserId({
    projectId: params.id,
    raw: body.userId,
    groupKind,
  });
  if ("error" in link) {
    return NextResponse.json({ error: link.error }, { status: 400 });
  }

  const parentId: string | null =
    typeof body.parentId === "string" && body.parentId ? body.parentId : null;
  if (parentId) {
    const parent = await prisma.worker.findFirst({
      where: { id: parentId, projectId: params.id },
    });
    if (!parent) {
      return NextResponse.json({ error: "Atasan tidak valid" }, { status: 400 });
    }
  }

  const inviteToken = asInvite ? newInviteToken() : null;

  const worker = await prisma.worker.create({
    data: {
      projectId: params.id,
      groupId,
      userId: link.userId ?? null,
      name,
      position,
      phone: profile.phone ?? null,
      email: profile.email ?? null,
      nik: profile.nik ?? null,
      address: profile.address ?? null,
      birthDate: profile.birthDate ?? null,
      gender: profile.gender ?? null,
      bloodType: profile.bloodType ?? null,
      emergencyName: profile.emergencyName ?? null,
      emergencyPhone: profile.emergencyPhone ?? null,
      notes: profile.notes ?? null,
      parentId,
      joinedAt: profile.joinedAt ?? null,
      active: body.active !== false,
      inviteToken,
      inviteStatus: asInvite ? "PENDING" : "MANUAL",
    },
    include: {
      group: { select: { id: true, name: true, kind: true } },
    },
  });

  return NextResponse.json(
    asInvite
      ? { ...worker, invitePath: `/isi-data/${inviteToken}` }
      : worker
  );
}

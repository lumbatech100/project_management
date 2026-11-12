import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, forbidUnlessMenu } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageWorkers } from "@/lib/utils";
import { isWorkerPosition } from "@/lib/worker-positions";
import { resolveWorkerUserId } from "@/lib/attendance";
import {
  WorkerFieldError,
  parseWorkerProfile,
  workerNameOrThrow,
  type WorkerProfileFields,
} from "@/lib/worker-validation";

type Params = { params: Promise<{ id: string; workerId: string }> };

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

  const worker = await prisma.worker.findFirst({
    where: { id: params.workerId, projectId: params.id },
    include: {
      group: { select: { id: true, name: true, kind: true } },
    },
  });
  if (!worker) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(worker);
}

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

  const existing = await prisma.worker.findFirst({
    where: { id: params.workerId, projectId: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  let profile: WorkerProfileFields;
  let name: string;
  try {
    profile = parseWorkerProfile(body);
    name =
      body.name !== undefined ? workerNameOrThrow(body.name) ?? "" : existing.name;
  } catch (err) {
    if (err instanceof WorkerFieldError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
  const rawPos =
    typeof body.position === "string" ? body.position.trim() : existing.position;
  if (!name) {
    return NextResponse.json({ error: "Nama wajib" }, { status: 400 });
  }
  if (!isWorkerPosition(rawPos)) {
    return NextResponse.json(
      { error: "Jabatan wajib: PM, SM, Leader, Worker, atau HSE" },
      { status: 400 }
    );
  }
  const position = rawPos;

  let groupId: string | null | undefined = undefined;
  let groupKind: string | null = null;
  if (body.groupId === null || body.groupId === "") {
    groupId = null;
  } else if (typeof body.groupId === "string") {
    const g = await prisma.workerGroup.findFirst({
      where: { id: body.groupId, projectId: params.id },
    });
    if (!g) {
      return NextResponse.json({ error: "Grup tidak valid" }, { status: 400 });
    }
    groupId = body.groupId;
    groupKind = g.kind;
  } else if (existing.groupId) {
    const g = await prisma.workerGroup.findUnique({
      where: { id: existing.groupId },
      select: { kind: true },
    });
    groupKind = g?.kind ?? null;
  }

  const link = await resolveWorkerUserId({
    projectId: params.id,
    raw: body.userId,
    groupKind,
    workerId: existing.id,
  });
  if ("error" in link) {
    return NextResponse.json({ error: link.error }, { status: 400 });
  }
  let userId = link.userId;
  if (groupKind !== "INTERNAL" && existing.userId) {
    const keptGroupId = groupId === undefined ? existing.groupId : groupId;
    const stillLeader = keptGroupId
      ? await prisma.workerGroupLeader.findUnique({
          where: {
            groupId_userId: { groupId: keptGroupId, userId: existing.userId },
          },
          select: { id: true },
        })
      : null;
    userId = stillLeader ? existing.userId : null;
  }

  const parentId: string | null =
    body.parentId === null || body.parentId === ""
      ? null
      : typeof body.parentId === "string"
        ? body.parentId
        : existing.parentId;

  if (parentId === params.workerId) {
    return NextResponse.json(
      { error: "Tidak bisa menjadikan diri sendiri sebagai atasan" },
      { status: 400 }
    );
  }

  if (parentId) {
    const parent = await prisma.worker.findFirst({
      where: { id: parentId, projectId: params.id },
    });
    if (!parent) {
      return NextResponse.json({ error: "Atasan tidak valid" }, { status: 400 });
    }
    const all = await prisma.worker.findMany({
      where: { projectId: params.id },
      select: { id: true, parentId: true },
    });
    const parentMap = new Map(all.map((w) => [w.id, w.parentId]));
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === params.workerId) {
        return NextResponse.json(
          { error: "Struktur organisasi tidak valid (siklus)" },
          { status: 400 }
        );
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = parentMap.get(cursor) ?? null;
    }
  }

  const worker = await prisma.worker.update({
    where: { id: params.workerId },
    data: {
      name,
      position,
      groupId,
      userId,
      ...profile,
      parentId,
      active: typeof body.active === "boolean" ? body.active : undefined,
    },
    include: {
      group: { select: { id: true, name: true, kind: true } },
    },
  });

  return NextResponse.json(worker);
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

  const existing = await prisma.worker.findFirst({
    where: { id: params.workerId, projectId: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.worker.updateMany({
    where: { parentId: params.workerId },
    data: { parentId: null },
  });

  await prisma.worker.delete({ where: { id: params.workerId } });
  return NextResponse.json({ ok: true });
}

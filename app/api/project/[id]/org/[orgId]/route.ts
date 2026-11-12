import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canCreateProject } from "@/lib/utils";

type Params = { params: Promise<{ id: string; orgId: string }> };

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
  if (!canCreateProject(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.orgPerson.findFirst({
    where: { id: params.orgId, projectId: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : existing.name;
  const position =
    typeof body.position === "string"
      ? body.position.trim()
      : existing.position;
  if (!name) {
    return NextResponse.json({ error: "Nama wajib" }, { status: 400 });
  }
  if (!position) {
    return NextResponse.json({ error: "Jabatan wajib" }, { status: 400 });
  }

  const parentId: string | null =
    body.parentId === null || body.parentId === ""
      ? null
      : typeof body.parentId === "string"
        ? body.parentId
        : existing.parentId;

  if (parentId === params.orgId) {
    return NextResponse.json(
      { error: "Tidak bisa menjadikan diri sendiri sebagai atasan" },
      { status: 400 }
    );
  }

  if (parentId) {
    const parent = await prisma.orgPerson.findFirst({
      where: { id: parentId, projectId: params.id },
    });
    if (!parent) {
      return NextResponse.json({ error: "Atasan tidak valid" }, { status: 400 });
    }
    const all = await prisma.orgPerson.findMany({
      where: { projectId: params.id },
      select: { id: true, parentId: true },
    });
    const parentMap = new Map(all.map((p) => [p.id, p.parentId]));
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === params.orgId) {
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

  const person = await prisma.orgPerson.update({
    where: { id: params.orgId },
    data: {
      name,
      position,
      parentId,
      phone:
        body.phone !== undefined
          ? typeof body.phone === "string"
            ? body.phone.trim() || null
            : null
          : undefined,
      email:
        body.email !== undefined
          ? typeof body.email === "string"
            ? body.email.trim() || null
            : null
          : undefined,
      notes:
        body.notes !== undefined
          ? typeof body.notes === "string"
            ? body.notes.trim() || null
            : null
          : undefined,
      active: typeof body.active === "boolean" ? body.active : undefined,
    },
  });

  return NextResponse.json(person);
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
  if (!canCreateProject(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.orgPerson.findFirst({
    where: { id: params.orgId, projectId: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.orgPerson.updateMany({
    where: { parentId: params.orgId },
    data: { parentId: null },
  });
  await prisma.orgPerson.delete({ where: { id: params.orgId } });

  return NextResponse.json({ ok: true });
}

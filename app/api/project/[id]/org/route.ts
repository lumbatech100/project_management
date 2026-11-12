import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, forbidUnlessMenu } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canCreateProject } from "@/lib/utils";

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
  const noMenu = forbidUnlessMenu(session.user, "project.details");
  if (noMenu) return noMenu;

  const people = await prisma.orgPerson.findMany({
    where: { projectId: params.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(people);
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
  if (!canCreateProject(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const position =
    typeof body.position === "string" ? body.position.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Nama wajib" }, { status: 400 });
  }
  if (!position) {
    return NextResponse.json({ error: "Jabatan wajib" }, { status: 400 });
  }

  const parentId: string | null =
    typeof body.parentId === "string" && body.parentId ? body.parentId : null;
  if (parentId) {
    const parent = await prisma.orgPerson.findFirst({
      where: { id: parentId, projectId: params.id },
    });
    if (!parent) {
      return NextResponse.json({ error: "Atasan tidak valid" }, { status: 400 });
    }
  }

  const person = await prisma.orgPerson.create({
    data: {
      projectId: params.id,
      name,
      position,
      phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
      email: typeof body.email === "string" ? body.email.trim() || null : null,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      parentId,
      active: body.active !== false,
    },
  });

  return NextResponse.json(person);
}

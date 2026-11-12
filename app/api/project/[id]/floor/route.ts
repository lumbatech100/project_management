import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageDrawing } from "@/lib/utils";

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

  const floors = await prisma.floor.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "asc" },
    include: {
      markers: {
        include: { items: { orderBy: { name: "asc" } } },
      },
    },
  });

  return NextResponse.json(floors);
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
  if (!canManageDrawing(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Nama wajib diisi" }, { status: 400 });
  }

  const floor = await prisma.floor.create({
    data: {
      projectId: params.id,
      name: body.name.trim(),
    },
  });

  return NextResponse.json(floor, { status: 201 });
}

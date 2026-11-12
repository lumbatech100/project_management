import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, forbidUnlessMenu } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageCost } from "@/lib/utils";

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
  const noMenu = forbidUnlessMenu(session.user, "project.cost");
  if (noMenu) return noMenu;

  const items = await prisma.incomeItem.findMany({
    where: { projectId: params.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(items);
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
  if (!canManageCost(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const amount = parseFloat(body.amount);
  if (!body.name?.trim() || Number.isNaN(amount)) {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const item = await prisma.incomeItem.create({
    data: {
      projectId: params.id,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      amount,
      date: body.date ? new Date(body.date) : new Date(),
      createdBy: session.user.name || session.user.email,
    },
  });

  return NextResponse.json(item, { status: 201 });
}

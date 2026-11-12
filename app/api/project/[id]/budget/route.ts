import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, forbidUnlessMenu } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageCost } from "@/lib/utils";
import { ensureCostCategories } from "@/lib/cost-categories";

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

  await ensureCostCategories(params.id);

  let budget = await prisma.projectBudget.findUnique({
    where: { projectId: params.id },
    include: {
      lines: {
        include: { category: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
  });

  if (!budget) {
    await prisma.projectBudget.create({
      data: { projectId: params.id, totalValue: 0 },
    });
    budget = await prisma.projectBudget.findUnique({
      where: { projectId: params.id },
      include: {
        lines: {
          include: { category: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
      },
    });
  }

  return NextResponse.json(budget);
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
  if (!canManageCost(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await ensureCostCategories(params.id);

  const body = await req.json();
  const totalValue = parseFloat(body.totalValue);
  if (Number.isNaN(totalValue) || totalValue < 0) {
    return NextResponse.json(
      { error: "Nilai project tidak valid" },
      { status: 400 }
    );
  }

  const lines = (body.lines || []) as {
    categoryId: string;
    planned: number;
    note?: string | null;
  }[];

  const budget = await prisma.$transaction(async (tx) => {
    await tx.projectBudget.upsert({
      where: { projectId: params.id },
      create: {
        projectId: params.id,
        totalValue,
        notes: body.notes || null,
      },
      update: {
        totalValue,
        notes: body.notes ?? undefined,
      },
    });

    for (const l of lines) {
      if (!l.categoryId) continue;
      const planned = Math.max(0, Number(l.planned) || 0);
      const cat = await tx.costCategory.findFirst({
        where: { id: l.categoryId, projectId: params.id },
      });
      if (!cat) continue;
      await tx.budgetLine.upsert({
        where: { categoryId: cat.id },
        create: {
          projectId: params.id,
          categoryId: cat.id,
          name: cat.name,
          planned,
          sortOrder: cat.sortOrder,
          note: l.note ?? null,
        },
        update: {
          planned,
          name: cat.name,
          sortOrder: cat.sortOrder,
          note: l.note ?? undefined,
        },
      });
    }

    return tx.projectBudget.findUnique({
      where: { projectId: params.id },
      include: {
        lines: {
          include: { category: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
      },
    });
  });

  return NextResponse.json(budget);
}

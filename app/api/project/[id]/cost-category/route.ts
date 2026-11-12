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

  const categories = await ensureCostCategories(params.id);
  return NextResponse.json(categories);
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

  await ensureCostCategories(params.id);

  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Nama kategori wajib" }, { status: 400 });
  }

  const maxSort = await prisma.costCategory.aggregate({
    where: { projectId: params.id },
    _max: { sortOrder: true },
  });
  const sortOrder =
    body.sortOrder !== undefined
      ? parseInt(String(body.sortOrder), 10)
      : (maxSort._max.sortOrder ?? -1) + 1;

  try {
    const cat = await prisma.$transaction(async (tx) => {
      await tx.projectBudget.upsert({
        where: { projectId: params.id },
        create: { projectId: params.id, totalValue: 0 },
        update: {},
      });
      const created = await tx.costCategory.create({
        data: {
          projectId: params.id,
          name,
          sortOrder: Number.isNaN(sortOrder) ? 0 : sortOrder,
          active: body.active === false ? false : true,
        },
      });
      await tx.budgetLine.create({
        data: {
          projectId: params.id,
          categoryId: created.id,
          name,
          planned: Math.max(0, parseFloat(body.planned) || 0),
          sortOrder: created.sortOrder,
        },
      });
      return tx.costCategory.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          budgetLine: true,
          _count: { select: { costs: true } },
        },
      });
    });
    return NextResponse.json(cat, { status: 201 });
  } catch (e: unknown) {
    const dup =
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2002";
    return NextResponse.json(
      { error: dup ? "Nama kategori sudah ada" : "Gagal membuat kategori" },
      { status: 400 }
    );
  }
}

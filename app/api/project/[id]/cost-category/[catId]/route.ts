import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageCost } from "@/lib/utils";

type Params = { params: Promise<{ id: string; catId: string }> };

async function findCat(projectId: string, catId: string) {
  return prisma.costCategory.findFirst({
    where: { id: catId, projectId },
    include: {
      budgetLine: true,
      _count: { select: { costs: true } },
    },
  });
}

export async function PATCH(req: NextRequest, props: Params) {
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

  const existing = await findCat(params.id, params.catId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const data: {
    name?: string;
    sortOrder?: number;
    active?: boolean;
  } = {};

  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Nama kategori wajib" }, { status: 400 });
    }
    data.name = name;
  }
  if (body.sortOrder !== undefined) {
    const sortOrder = parseInt(String(body.sortOrder), 10);
    if (!Number.isNaN(sortOrder)) data.sortOrder = sortOrder;
  }
  if (body.active !== undefined) {
    data.active = !!body.active;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.costCategory.update({
        where: { id: params.catId },
        data,
      });
      if (data.name !== undefined || data.sortOrder !== undefined) {
        await tx.budgetLine.updateMany({
          where: { categoryId: params.catId },
          data: {
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.sortOrder !== undefined
              ? { sortOrder: data.sortOrder }
              : {}),
          },
        });
      }
    });
    const cat = await findCat(params.id, params.catId);
    return NextResponse.json(cat);
  } catch (e: unknown) {
    const dup =
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2002";
    return NextResponse.json(
      { error: dup ? "Nama kategori sudah ada" : "Gagal update kategori" },
      { status: 400 }
    );
  }
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
  if (!canManageCost(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await findCat(params.id, params.catId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing._count.costs > 0) {
    return NextResponse.json(
      {
        error: `Kategori masih dipakai ${existing._count.costs} pengeluaran. Hapus/pindahkan dulu.`,
      },
      { status: 400 }
    );
  }

  // BudgetLine cascade via category onDelete Cascade
  await prisma.costCategory.delete({ where: { id: params.catId } });
  return NextResponse.json({ ok: true });
}

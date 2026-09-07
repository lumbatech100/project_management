import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageCost } from "@/lib/utils";

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let budget = await prisma.projectBudget.findUnique({
    where: { projectId: params.id },
    include: { lines: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });

  if (!budget) {
    budget = await prisma.projectBudget.create({
      data: {
        projectId: params.id,
        totalValue: 0,
      },
      include: { lines: true },
    });
  }

  return NextResponse.json(budget);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageCost(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const totalValue = parseFloat(body.totalValue);
  if (Number.isNaN(totalValue) || totalValue < 0) {
    return NextResponse.json(
      { error: "Nilai project tidak valid" },
      { status: 400 }
    );
  }

  const lines = (body.lines || []) as {
    id?: string;
    name: string;
    planned: number;
    note?: string | null;
  }[];

  const cleaned = lines
    .map((l, i) => ({
      id: l.id,
      name: (l.name || "").trim(),
      planned: Number(l.planned) || 0,
      note: l.note || null,
      sortOrder: i,
    }))
    .filter((l) => l.name.length > 0);

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

    const existing = await tx.budgetLine.findMany({
      where: { projectId: params.id },
    });
    const keepIds = new Set(
      cleaned.map((l) => l.id).filter(Boolean) as string[]
    );

    const toDelete = existing.filter((e) => !keepIds.has(e.id));
    if (toDelete.length) {
      await tx.budgetLine.deleteMany({
        where: { id: { in: toDelete.map((d) => d.id) } },
      });
    }

    for (const line of cleaned) {
      if (line.id && existing.some((e) => e.id === line.id)) {
        await tx.budgetLine.update({
          where: { id: line.id },
          data: {
            name: line.name,
            planned: line.planned,
            note: line.note,
            sortOrder: line.sortOrder,
          },
        });
      } else {
        await tx.budgetLine.create({
          data: {
            projectId: params.id,
            name: line.name,
            planned: line.planned,
            note: line.note,
            sortOrder: line.sortOrder,
          },
        });
      }
    }

    return tx.projectBudget.findUnique({
      where: { projectId: params.id },
      include: {
        lines: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      },
    });
  });

  return NextResponse.json(budget);
}

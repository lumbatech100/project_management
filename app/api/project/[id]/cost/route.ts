import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { BudgetCategory, OperationType } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageCost } from "@/lib/utils";

type Params = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const category = req.nextUrl.searchParams.get(
    "category"
  ) as BudgetCategory | null;

  const items = await prisma.costItem.findMany({
    where: {
      projectId: params.id,
      ...(category ? { category } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest, { params }: Params) {
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
  const category = body.category as BudgetCategory;
  const amount = parseFloat(body.amount);

  if (!category || !body.name?.trim() || Number.isNaN(amount)) {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const item = await prisma.costItem.create({
    data: {
      projectId: params.id,
      category,
      operationType:
        category === "OPERATION"
          ? ((body.operationType as OperationType) || "GAJI_WORKER")
          : null,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      amount,
      quantity:
        body.quantity !== undefined && body.quantity !== ""
          ? parseFloat(body.quantity)
          : null,
      unit: body.unit?.trim() || null,
      date: body.date ? new Date(body.date) : new Date(),
      createdBy: session.user.name || session.user.email,
    },
  });

  return NextResponse.json(item, { status: 201 });
}

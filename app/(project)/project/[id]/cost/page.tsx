import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageCost, canRecordExpense } from "@/lib/utils";
import { ensureCostCategories } from "@/lib/cost-categories";
import { CostView } from "@/components/project/CostView";
import { hasMenu } from "@/lib/menus";

export default async function CostPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await getSession();
  if (!hasMenu(session?.user?.menus, "project.cost")) notFound();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      costs: {
        include: { category: { select: { id: true, name: true } } },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      },
      budget: true,
      purchaseOrders: { select: { totalValue: true } },
    },
  });

  if (!project) notFound();

  if (!project.budget) {
    await prisma.projectBudget.create({
      data: { projectId: project.id, totalValue: 0 },
    });
  }

  const categories = await ensureCostCategories(project.id);

  const budget = await prisma.projectBudget.findUniqueOrThrow({
    where: { projectId: project.id },
    include: {
      lines: {
        include: { category: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
  });

  const poSumValue = project.purchaseOrders.reduce(
    (s, po) => s + (po.totalValue || 0),
    0
  );

  return (
    <CostView
      projectId={project.id}
      budget={{
        projectId: budget.projectId,
        totalValue: budget.totalValue,
        notes: budget.notes,
        lines: budget.lines.map((l) => ({
          id: l.id,
          categoryId: l.categoryId,
          name: l.name,
          planned: l.planned,
          note: l.note,
          sortOrder: l.sortOrder,
        })),
      }}
      costs={project.costs.map((c) => ({
        id: c.id,
        categoryId: c.categoryId,
        operationType: c.operationType,
        name: c.name,
        description: c.description,
        amount: c.amount,
        quantity: c.quantity,
        unit: c.unit,
        receiptUrl: c.receiptUrl,
        date: c.date,
        createdBy: c.createdBy,
        category: c.category,
      }))}
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
        active: c.active,
        budgetLine: c.budgetLine
          ? { id: c.budgetLine.id, planned: c.budgetLine.planned }
          : null,
        _count: c._count,
      }))}
      poSumValue={poSumValue > 0 ? poSumValue : null}
      canManage={canManageCost(session!.user.role, session!.user.menus)}
      canRecord={canRecordExpense(session!.user.role, session!.user.menus)}
    />
  );
}

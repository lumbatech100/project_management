import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageCost } from "@/lib/utils";
import { CostView } from "@/components/project/CostView";

export default async function CostPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      costs: {
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      },
      incomes: {
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      },
      budget: {
        include: {
          lines: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        },
      },
    },
  });

  if (!project) notFound();

  let budget = project.budget;
  if (!budget) {
    budget = await prisma.projectBudget.create({
      data: {
        projectId: project.id,
        totalValue: 0,
      },
      include: { lines: true },
    });
  }

  return (
    <CostView
      projectId={project.id}
      budget={{
        projectId: budget.projectId,
        totalValue: budget.totalValue,
        notes: budget.notes,
        lines: budget.lines,
      }}
      costs={project.costs}
      incomes={project.incomes}
      canManage={canManageCost(session!.user.role)}
    />
  );
}

import { prisma } from "@/lib/prisma";
import { DEFAULT_COST_CATEGORIES } from "@/lib/budget-categories";

/** Pastikan project punya kategori default + budget line (idempotent). */
export async function ensureCostCategories(projectId: string) {
  const existing = await prisma.costCategory.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  if (existing.length === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.projectBudget.upsert({
        where: { projectId },
        create: { projectId, totalValue: 0 },
        update: {},
      });
      for (let i = 0; i < DEFAULT_COST_CATEGORIES.length; i++) {
        const def = DEFAULT_COST_CATEGORIES[i]!;
        const cat = await tx.costCategory.create({
          data: {
            projectId,
            name: def.name,
            sortOrder: i,
            active: true,
          },
        });
        await tx.budgetLine.create({
          data: {
            projectId,
            categoryId: cat.id,
            name: def.name,
            planned: 0,
            sortOrder: i,
          },
        });
      }
    });
  } else {
    // Pastikan tiap kategori aktif punya budget line
    await prisma.projectBudget.upsert({
      where: { projectId },
      create: { projectId, totalValue: 0 },
      update: {},
    });
    for (const cat of existing) {
      await prisma.budgetLine.upsert({
        where: { categoryId: cat.id },
        create: {
          projectId,
          categoryId: cat.id,
          name: cat.name,
          planned: 0,
          sortOrder: cat.sortOrder,
        },
        update: {},
      });
    }
  }

  return prisma.costCategory.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      budgetLine: true,
      _count: { select: { costs: true } },
    },
  });
}

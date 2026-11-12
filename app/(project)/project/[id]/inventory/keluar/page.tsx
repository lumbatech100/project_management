import { prisma } from "@/lib/prisma";
import { lowStockItems, noteInclude, syncPoInventoryItems } from "@/lib/inventory";
import { loadInventoryPage } from "@/lib/inventory-page";
import { InventoryOutView } from "@/components/project/inventory/InventoryOutView";

export default async function BarangKeluarPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const { project, canRecord } = await loadInventoryPage(params.id);

  await syncPoInventoryItems(params.id);
  const [items, notes, lowStock] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { projectId: params.id },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, unit: true, qty: true, category: true },
    }),
    prisma.deliveryNote.findMany({
      where: { projectId: params.id, direction: "OUT" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: noteInclude,
    }),
    lowStockItems(params.id),
  ]);

  return (
    <InventoryOutView
      projectId={params.id}
      projectName={project.name}
      items={items}
      notes={notes}
      lowStock={lowStock}
      canRecord={canRecord}
    />
  );
}

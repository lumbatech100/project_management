import { prisma } from "@/lib/prisma";
import {
  lowStockItems,
  noteInclude,
  poStatsByItem,
  syncPoInventoryItems,
} from "@/lib/inventory";
import { loadInventoryPage } from "@/lib/inventory-page";
import { InventoryInView } from "@/components/project/inventory/InventoryInView";

export default async function BarangMasukPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const { canManage, canRecord } = await loadInventoryPage(params.id);

  await syncPoInventoryItems(params.id);
  const [items, notes, stats, lowStock] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { projectId: params.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, category: true, name: true, code: true, unit: true, qty: true },
    }),
    prisma.deliveryNote.findMany({
      where: { projectId: params.id, direction: "IN" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: noteInclude,
    }),
    poStatsByItem(prisma, params.id),
    lowStockItems(params.id),
  ]);

  const mainItems = items
    .filter((i) => i.category === "MAIN" && stats.has(i.id))
    .map((i) => {
      const s = stats.get(i.id)!;
      return {
        id: i.id,
        name: i.name,
        code: i.code,
        unit: i.unit,
        poQty: s.poQty,
        received: s.received,
        poLines: s.lines.map((l) => ({
          id: l.id,
          qty: l.qty,
          received: l.received,
          notes: l.notes,
        })),
      };
    });
  const supportItems = items
    .filter((i) => i.category === "SUPPORT")
    .map((i) => ({ id: i.id, name: i.name, unit: i.unit, qty: i.qty }));

  return (
    <InventoryInView
      projectId={params.id}
      mainItems={mainItems}
      supportItems={supportItems}
      notes={notes}
      lowStock={lowStock}
      canRecord={canRecord}
      canManage={canManage}
    />
  );
}

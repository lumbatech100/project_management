import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import {
  lowStockItems,
  movementTotals,
  poStatsByItem,
  syncPoInventoryItems,
} from "@/lib/inventory";
import { loadInventoryPage } from "@/lib/inventory-page";
import { StockRecapView } from "@/components/project/inventory/StockRecapView";
import { ItemRequestView } from "@/components/project/inventory/ItemRequestView";

export default async function RekapStokPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await props.params;
  const { tab } = await props.searchParams;
  const { user, canManage, canRecord } = await loadInventoryPage(params.id);
  const base = `/project/${params.id}/inventory/stok`;
  const showRequests = tab === "permintaan";

  await syncPoInventoryItems(params.id);
  const [items, lowStock, openRequests] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { projectId: params.id },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    lowStockItems(params.id),
    prisma.itemRequest.count({
      where: { projectId: params.id, status: { in: ["REQUESTED", "PURCHASING"] } },
    }),
  ]);

  const tabs = (
    <div className="flex flex-wrap gap-2 border-b border-slate-200">
      {[
        { href: base, label: "Stok gudang", active: !showRequests },
        {
          href: `${base}?tab=permintaan`,
          label: `Permintaan barang${openRequests ? ` (${openRequests})` : ""}`,
          active: showRequests,
        },
      ].map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            t.active
              ? "border-brand text-brand"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );

  if (showRequests) {
    const requests = await prisma.itemRequest.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: "desc" },
    });
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Rekap stok</h1>
          <p className="mt-1 text-sm text-slate-500">Permintaan barang dari site ke gudang.</p>
        </div>
        {tabs}
        <ItemRequestView
          projectId={params.id}
          requests={requests}
          items={items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, qty: i.qty }))}
          currentUserId={user.id}
          canRequest={canRecord}
          canManage={canManage}
        />
      </div>
    );
  }

  const [totals, stats] = await Promise.all([
    movementTotals(params.id),
    poStatsByItem(prisma, params.id),
  ]);
  const rows = items.map((i) => {
    const t = totals.get(i.id);
    return {
      id: i.id,
      category: i.category,
      name: i.name,
      code: i.code,
      unit: i.unit,
      qty: i.qty,
      minQty: i.minQty,
      notes: i.notes,
      inQty: t?.inQty ?? 0,
      outQty: t?.outQty ?? 0,
      poQty: stats.get(i.id)?.poQty ?? null,
    };
  });

  return (
    <StockRecapView
      projectId={params.id}
      items={rows}
      lowStock={lowStock}
      canManage={canManage}
      tabs={tabs}
    />
  );
}

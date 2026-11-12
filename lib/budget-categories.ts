/** Default kategori saat project baru / migrasi dari enum lama */
export const DEFAULT_COST_CATEGORIES = [
  { key: "MODAL_BARANG", name: "Modal Barang" },
  { key: "JASA", name: "Jasa" },
  { key: "PRELIM", name: "Preliminary" },
  { key: "EQUIPMENT", name: "Equipment" },
  { key: "OPERATION", name: "Operation" },
  { key: "OTHER", name: "Lainnya" },
] as const;

export type DefaultCostCategoryKey =
  (typeof DEFAULT_COST_CATEGORIES)[number]["key"];

export const DEFAULT_COST_CATEGORY_LABELS: Record<
  DefaultCostCategoryKey,
  string
> = Object.fromEntries(
  DEFAULT_COST_CATEGORIES.map((c) => [c.key, c.name])
) as Record<DefaultCostCategoryKey, string>;

/** @deprecated pakai nama dari CostCategory */
export function budgetCategoryLabel(cat: string) {
  return (
    DEFAULT_COST_CATEGORY_LABELS[cat as DefaultCostCategoryKey] || String(cat)
  );
}

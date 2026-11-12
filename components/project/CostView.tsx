"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn, formatRp } from "@/lib/utils";

type OperationType = "GAJI_WORKER" | "KASBON" | "LAINNYA";

type MainTab =
  | "ringkasan"
  | "kategori"
  | "breakdown"
  | "pengeluaran"
  | "profit";

export interface CostCategoryRow {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  budgetLine?: { id: string; planned: number } | null;
  _count?: { costs: number };
}

export interface CostItemRow {
  id: string;
  categoryId: string;
  operationType?: OperationType | null;
  name: string;
  description?: string | null;
  amount: number;
  quantity?: number | null;
  unit?: string | null;
  receiptUrl?: string | null;
  date: string | Date;
  createdBy?: string | null;
  category?: { id: string; name: string } | null;
}

export interface BudgetLineRow {
  id?: string;
  categoryId: string;
  name: string;
  planned: number;
  note?: string | null;
  sortOrder?: number;
}

export interface BudgetData {
  projectId: string;
  /** Nilai PO / kontrak project (bukan pemasukan) */
  totalValue: number;
  notes?: string | null;
  lines: BudgetLineRow[];
}

interface CostViewProps {
  projectId: string;
  budget: BudgetData;
  costs: CostItemRow[];
  categories: CostCategoryRow[];
  /** Jumlah nilai dari modul Progress PO (opsional, untuk acuan) */
  poSumValue?: number | null;
  /** Atur nilai PO, kategori, plafon anggaran */
  canManage: boolean;
  /** Catat / hapus pengeluaran di luar PO */
  canRecord: boolean;
}

type DraftLine = {
  categoryId: string;
  name: string;
  id?: string;
  planned: string;
};

const MAIN_TABS: { key: MainTab; label: string }[] = [
  { key: "ringkasan", label: "Ringkasan" },
  { key: "kategori", label: "Kategori" },
  { key: "breakdown", label: "Anggaran" },
  { key: "pengeluaran", label: "Pengeluaran" },
  { key: "profit", label: "Proyeksi Profit" },
];

function toDraftLines(
  lines: BudgetLineRow[],
  categories: CostCategoryRow[]
): DraftLine[] {
  const byCat = Object.fromEntries(
    lines.map((l) => [l.categoryId, l])
  ) as Record<string, BudgetLineRow>;
  return categories
    .filter((c) => c.active)
    .map((c) => ({
      categoryId: c.id,
      name: c.name,
      id: byCat[c.id]?.id,
      planned: String(byCat[c.id]?.planned ?? c.budgetLine?.planned ?? 0),
    }));
}

function pctOf(part: number, whole: number) {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export function CostView({
  projectId,
  budget: initialBudget,
  costs: initialCosts,
  categories: initialCategories,
  poSumValue = null,
  canManage,
  canRecord,
}: CostViewProps) {
  const [mainTab, setMainTab] = useState<MainTab>("ringkasan");
  const [budget, setBudget] = useState(initialBudget);
  const [costs, setCosts] = useState(initialCosts);
  const [categories, setCategories] = useState(initialCategories);

  const activeCategories = useMemo(
    () =>
      [...categories]
        .filter((c) => c.active)
        .sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
        ),
    [categories]
  );

  const [totalDraft, setTotalDraft] = useState(
    String(initialBudget.totalValue || "")
  );
  const [linesDraft, setLinesDraft] = useState(() =>
    toDraftLines(initialBudget.lines, initialCategories)
  );
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetMsg, setBudgetMsg] = useState("");

  const [expenseCatId, setExpenseCatId] = useState(
    () => initialCategories.find((c) => c.active)?.id || ""
  );
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [expenseForm, setExpenseForm] = useState({
    categoryId: initialCategories.find((c) => c.active)?.id || "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    note: "",
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  const [catModal, setCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<CostCategoryRow | null>(null);
  const [catName, setCatName] = useState("");
  const [catBusy, setCatBusy] = useState(false);
  const [catError, setCatError] = useState("");

  const nilaiPo = budget.totalValue;
  const totalExpense = costs.reduce((s, i) => s + i.amount, 0);
  const plannedTotal = budget.lines.reduce((s, l) => s + l.planned, 0);
  const sisaAnggaran = plannedTotal - totalExpense;
  const sisaVsPo = nilaiPo - totalExpense;
  const overBudget = totalExpense > plannedTotal && plannedTotal > 0;
  const overPo = totalExpense > nilaiPo && nilaiPo > 0;

  /** Profit jika pengeluaran mengikuti anggaran (rencana) */
  const profitRencana = nilaiPo - plannedTotal;
  /** Profit berdasarkan pengeluaran aktual saat ini */
  const profitAktual = nilaiPo - totalExpense;
  /** Jika sisa anggaran masih akan dibelanjakan penuh */
  const profitJikaAnggaranHabis = nilaiPo - plannedTotal;

  const actualByCat = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of categories) map[c.id] = 0;
    for (const c of costs) map[c.categoryId] = (map[c.categoryId] || 0) + c.amount;
    return map;
  }, [costs, categories]);

  const plannedByCat = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of categories) map[c.id] = 0;
    for (const l of budget.lines) map[l.categoryId] = l.planned || 0;
    return map;
  }, [budget.lines, categories]);

  const remainingByCat = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of categories) {
      map[c.id] = (plannedByCat[c.id] || 0) - (actualByCat[c.id] || 0);
    }
    return map;
  }, [categories, plannedByCat, actualByCat]);

  const filteredExpenses = costs.filter((c) => c.categoryId === expenseCatId);
  const expenseCatName =
    categories.find((c) => c.id === expenseCatId)?.name || "Kategori";

  function syncBudgetFromApi(data: {
    projectId: string;
    totalValue: number;
    notes?: string | null;
    lines: {
      id: string;
      categoryId: string;
      name: string;
      planned: number;
      note?: string | null;
      sortOrder?: number;
    }[];
  }) {
    const lines: BudgetLineRow[] = data.lines.map((l) => ({
      id: l.id,
      categoryId: l.categoryId,
      name: l.name,
      planned: l.planned,
      note: l.note,
      sortOrder: l.sortOrder,
    }));
    setBudget({
      projectId: data.projectId,
      totalValue: data.totalValue,
      notes: data.notes,
      lines,
    });
    return lines;
  }

  async function refreshCategories() {
    const res = await fetch(`/api/project/${projectId}/cost-category`);
    if (!res.ok) return;
    const data = (await res.json()) as CostCategoryRow[];
    setCategories(data);
    setLinesDraft((prev) => {
      const byId = Object.fromEntries(prev.map((l) => [l.categoryId, l]));
      return toDraftLines(
        Object.values(byId).map((l) => ({
          categoryId: l.categoryId,
          name: l.name,
          planned: parseFloat(l.planned) || 0,
          id: l.id,
        })),
        data
      );
    });
    if (!data.some((c) => c.id === expenseCatId && c.active)) {
      const first = data.find((c) => c.active);
      if (first) setExpenseCatId(first.id);
    }
  }

  async function saveBudget() {
    setSavingBudget(true);
    setBudgetMsg("");
    try {
      const res = await fetch(`/api/project/${projectId}/budget`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalValue: parseFloat(totalDraft) || 0,
          lines: linesDraft.map((l) => ({
            categoryId: l.categoryId,
            planned: parseFloat(l.planned) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");
      const lines = syncBudgetFromApi(data);
      setLinesDraft(toDraftLines(lines, categories));
      setTotalDraft(String(data.totalValue));
      setBudgetMsg("Anggaran tersimpan");
    } catch (err) {
      setBudgetMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingBudget(false);
    }
  }

  function applyPoSumAsNilai() {
    if (poSumValue == null || poSumValue <= 0) return;
    setTotalDraft(String(poSumValue));
  }

  async function createExpense(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (!receiptFile) throw new Error("Bukti pembayaran wajib");
      const fd = new FormData();
      fd.set("categoryId", expenseForm.categoryId);
      fd.set("amount", expenseForm.amount);
      fd.set("date", expenseForm.date);
      if (expenseForm.note.trim()) fd.set("note", expenseForm.note.trim());
      fd.set("receipt", receiptFile);
      const res = await fetch(`/api/project/${projectId}/cost`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      setCosts((prev) => [data, ...prev]);
      setExpenseCatId(expenseForm.categoryId);
      setExpenseOpen(false);
      setExpenseForm({
        categoryId: expenseForm.categoryId,
        amount: "",
        date: new Date().toISOString().slice(0, 10),
        note: "",
      });
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
      setReceiptFile(null);
      setReceiptPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  function openExpenseModal() {
    setError("");
    setExpenseForm({
      categoryId: expenseCatId || activeCategories[0]?.id || "",
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      note: "",
    });
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptFile(null);
    setReceiptPreview(null);
    setExpenseOpen(true);
  }

  async function deleteExpense(id: string) {
    if (!confirm("Hapus pengeluaran ini?")) return;
    const res = await fetch(`/api/project/${projectId}/cost/${id}`, {
      method: "DELETE",
    });
    if (res.ok) setCosts((prev) => prev.filter((i) => i.id !== id));
  }

  function openAddCategory() {
    setEditingCat(null);
    setCatName("");
    setCatError("");
    setCatModal(true);
  }

  function openEditCategory(cat: CostCategoryRow) {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatError("");
    setCatModal(true);
  }

  async function saveCategory() {
    setCatBusy(true);
    setCatError("");
    try {
      const url = editingCat
        ? `/api/project/${projectId}/cost-category/${editingCat.id}`
        : `/api/project/${projectId}/cost-category`;
      const res = await fetch(url, {
        method: editingCat ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: catName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");
      setCatModal(false);
      const catRes = await fetch(`/api/project/${projectId}/cost-category`);
      const cats = catRes.ok
        ? ((await catRes.json()) as CostCategoryRow[])
        : categories;
      setCategories(cats);
      const bRes = await fetch(`/api/project/${projectId}/budget`);
      if (bRes.ok) {
        const b = await bRes.json();
        const lines = syncBudgetFromApi(b);
        setLinesDraft(toDraftLines(lines, cats));
      }
      if (!editingCat && data?.id) setExpenseCatId(data.id);
    } catch (err) {
      setCatError(err instanceof Error ? err.message : "Error");
    } finally {
      setCatBusy(false);
    }
  }

  async function deleteCategory(cat: CostCategoryRow) {
    if (
      !confirm(
        `Hapus kategori "${cat.name}"? Batas anggaran kategori ini ikut terhapus.`
      )
    ) {
      return;
    }
    setCatBusy(true);
    setCatError("");
    try {
      const res = await fetch(
        `/api/project/${projectId}/cost-category/${cat.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal hapus");
      await refreshCategories();
      setBudget((prev) => ({
        ...prev,
        lines: prev.lines.filter((l) => l.categoryId !== cat.id),
      }));
      setLinesDraft((prev) => prev.filter((l) => l.categoryId !== cat.id));
    } catch (err) {
      setCatError(err instanceof Error ? err.message : "Error");
    } finally {
      setCatBusy(false);
    }
  }

  const marginRencanaPct = pctOf(profitRencana, nilaiPo);
  const marginAktualPct = pctOf(profitAktual, nilaiPo);
  const budgetUsagePct = pctOf(totalExpense, plannedTotal);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Cost</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kontrol overbudget: nilai PO + plafon per kategori. Pengeluaran di
          luar PO (reimburse / belanja) dicatat dengan bukti dan memotong
          anggaran terpakai. Request barang ditunda.
        </p>
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MAIN_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setMainTab(t.key)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              mainTab === t.key
                ? "bg-brand text-white"
                : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {(overBudget || overPo) && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {overPo
            ? `Pengeluaran (${formatRp(totalExpense)}) sudah melebihi nilai PO (${formatRp(nilaiPo)}).`
            : `Pengeluaran melebihi total anggaran kategori (${formatRp(plannedTotal)}).`}
        </div>
      )}

      {mainTab === "ringkasan" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">Nilai PO</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {formatRp(nilaiPo)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Acuan pendapatan kontrak — bukan catatan pemasukan.
                </p>
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setMainTab("breakdown")}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Atur nilai PO & anggaran
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setMainTab("profit")}
                  >
                    Lihat proyeksi profit
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard
              label="Total anggaran"
              value={formatRp(plannedTotal)}
              tone="slate"
            />
            <SummaryCard
              label="Terpakai"
              value={formatRp(totalExpense)}
              tone="amber"
            />
            <SummaryCard
              label="Sisa anggaran"
              value={formatRp(sisaAnggaran)}
              tone={sisaAnggaran >= 0 ? "emerald" : "red"}
            />
            <SummaryCard
              label="Profit aktual"
              value={formatRp(profitAktual)}
              tone={profitAktual >= 0 ? "emerald" : "red"}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-1 text-sm font-semibold text-slate-900">
              Anggaran per kategori
            </h3>
            <p className="mb-4 text-xs text-slate-500">
              Batas − pengeluaran = sisa. Indikator overbudget per kategori.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Kategori</th>
                    <th className="py-2 pr-3 text-right font-medium">Batas</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Terpakai
                    </th>
                    <th className="py-2 text-right font-medium">Sisa</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCategories.map((cat) => {
                    const planned = plannedByCat[cat.id] || 0;
                    const used = actualByCat[cat.id] || 0;
                    const remain = remainingByCat[cat.id] || 0;
                    const pct =
                      planned > 0
                        ? Math.min(100, Math.round((used / planned) * 100))
                        : used > 0
                          ? 100
                          : 0;
                    return (
                      <tr
                        key={cat.id}
                        className="border-b border-slate-50 last:border-0"
                      >
                        <td className="py-3 pr-3">
                          <p className="font-medium text-slate-800">
                            {cat.name}
                          </p>
                          <div className="mt-1.5 h-1.5 max-w-[10rem] overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                remain < 0 ? "bg-red-500" : "bg-brand"
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums text-slate-600">
                          {formatRp(planned)}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums text-amber-700">
                          {formatRp(used)}
                        </td>
                        <td
                          className={cn(
                            "py-3 text-right font-semibold tabular-nums",
                            remain < 0 ? "text-red-600" : "text-emerald-700"
                          )}
                        >
                          {formatRp(remain)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {mainTab === "kategori" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Kategori biaya</h2>
              <p className="text-sm text-slate-500">
                Kelompok anggaran & pengeluaran (Modal Barang, Jasa, dll.).
              </p>
            </div>
            {canManage && (
              <Button size="sm" onClick={openAddCategory} disabled={catBusy}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Kategori baru
              </Button>
            )}
          </div>
          {catError && <p className="text-sm text-red-600">{catError}</p>}
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {categories.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-slate-400">
                Belum ada kategori
              </li>
            ) : (
              [...categories]
                .sort(
                  (a, b) =>
                    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
                )
                .map((cat) => (
                  <li
                    key={cat.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {cat.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        Batas{" "}
                        {formatRp(
                          cat.budgetLine?.planned ?? plannedByCat[cat.id] ?? 0
                        )}
                        {" · "}
                        {cat._count?.costs ?? actualByCat[cat.id] ?? 0}{" "}
                        pengeluaran
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditCategory(cat)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteCategory(cat)}
                          disabled={catBusy}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))
            )}
          </ul>
        </div>
      )}

      {mainTab === "breakdown" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="font-semibold text-slate-900">
              Nilai PO & batas anggaran
            </h2>
            <p className="text-sm text-slate-500">
              Nilai PO = acuan kontrak. Anggaran per kategori = plafon agar tidak
              overbudget.
            </p>
          </div>

          <div className="space-y-2">
            <Input
              id="total-value"
              label="Nilai PO (Rp)"
              type="number"
              min={0}
              value={totalDraft}
              onChange={(e) => setTotalDraft(e.target.value)}
              disabled={!canManage}
              placeholder="30000000000"
            />
            {poSumValue != null && poSumValue > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>
                  Total dari Progress PO:{" "}
                  <strong className="text-slate-700">
                    {formatRp(poSumValue)}
                  </strong>
                </span>
                {canManage && (
                  <button
                    type="button"
                    className="font-medium text-slate-900 underline"
                    onClick={applyPoSumAsNilai}
                  >
                    Pakai nilai ini
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-800">
              Batas per kategori
            </p>
            {linesDraft.length === 0 ? (
              <p className="text-sm text-slate-400">
                Belum ada kategori. Tambah di tab Kategori.
              </p>
            ) : (
              linesDraft.map((line) => (
                <div
                  key={line.categoryId}
                  className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[1fr_180px]"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {line.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Terpakai {formatRp(actualByCat[line.categoryId] || 0)} ·
                      Sisa{" "}
                      <span
                        className={cn(
                          "font-medium",
                          (parseFloat(line.planned) || 0) -
                            (actualByCat[line.categoryId] || 0) <
                            0
                            ? "text-red-600"
                            : "text-emerald-700"
                        )}
                      >
                        {formatRp(
                          (parseFloat(line.planned) || 0) -
                            (actualByCat[line.categoryId] || 0)
                        )}
                      </span>
                    </p>
                  </div>
                  <Input
                    id={`planned-${line.categoryId}`}
                    label="Batas (Rp)"
                    type="number"
                    min={0}
                    value={line.planned}
                    disabled={!canManage}
                    onChange={(e) => {
                      setLinesDraft((prev) =>
                        prev.map((l) =>
                          l.categoryId === line.categoryId
                            ? { ...l, planned: e.target.value }
                            : l
                        )
                      );
                    }}
                    placeholder="0"
                  />
                </div>
              ))
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="text-sm text-slate-500">
              <p>
                Total anggaran:{" "}
                <span className="font-semibold text-slate-900">
                  {formatRp(
                    linesDraft.reduce(
                      (s, l) => s + (parseFloat(l.planned) || 0),
                      0
                    )
                  )}
                </span>
              </p>
              {(parseFloat(totalDraft) || 0) > 0 && (
                <p className="mt-0.5 text-xs">
                  Proyeksi profit rencana:{" "}
                  {formatRp(
                    (parseFloat(totalDraft) || 0) -
                      linesDraft.reduce(
                        (s, l) => s + (parseFloat(l.planned) || 0),
                        0
                      )
                  )}
                </p>
              )}
            </div>
            {canManage && (
              <Button onClick={saveBudget} disabled={savingBudget}>
                {savingBudget ? "Menyimpan..." : "Simpan"}
              </Button>
            )}
          </div>
          {budgetMsg && (
            <p
              className={cn(
                "text-sm",
                budgetMsg.includes("tersimpan")
                  ? "text-emerald-600"
                  : "text-red-600"
              )}
            >
              {budgetMsg}
            </p>
          )}
        </div>
      )}

      {mainTab === "pengeluaran" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Catat belanja / reimburse{" "}
            <strong>di luar Progress PO</strong>. Pilih kategori anggaran, isi
            nominal, unggah bukti (bon atau transfer). Nominal langsung menambah{" "}
            <em>terpakai</em> dan mengurangi sisa plafon.
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {activeCategories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setExpenseCatId(cat.id)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
                  expenseCatId === cat.id
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {cat.name}
                <span className="ml-1.5 opacity-70">
                  {formatRp(actualByCat[cat.id] || 0)}
                </span>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="font-semibold text-slate-900">
                  {expenseCatName}
                </h2>
                <p className="text-xs text-slate-500">
                  Batas {formatRp(plannedByCat[expenseCatId] || 0)}
                  {" · "}
                  Terpakai {formatRp(actualByCat[expenseCatId] || 0)}
                  {" · "}
                  <span
                    className={cn(
                      "font-medium",
                      (remainingByCat[expenseCatId] || 0) < 0
                        ? "text-red-600"
                        : "text-emerald-700"
                    )}
                  >
                    Sisa {formatRp(remainingByCat[expenseCatId] || 0)}
                  </span>
                </p>
              </div>
              {canRecord && (
                <Button size="sm" onClick={openExpenseModal}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Catat pengeluaran
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Tanggal</th>
                    <th className="px-4 py-3 font-medium">Keterangan</th>
                    <th className="px-4 py-3 font-medium">Bukti</th>
                    <th className="px-4 py-3 font-medium text-right">Nominal</th>
                    {canRecord && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-10 text-center text-slate-400"
                      >
                        Belum ada pengeluaran di kategori ini
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-slate-50 last:border-0"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                          {new Date(item.date).toLocaleDateString("id-ID")}
                          {item.createdBy && (
                            <span className="mt-0.5 block text-[11px] text-slate-400">
                              {item.createdBy}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">
                            {item.description || item.name}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {item.receiptUrl ? (
                            <a
                              href={item.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block overflow-hidden rounded-lg border border-slate-200"
                              title="Lihat bukti"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={item.receiptUrl}
                                alt="Bukti"
                                className="h-12 w-12 object-cover"
                              />
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                          {formatRp(item.amount)}
                        </td>
                        {canRecord && (
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => deleteExpense(item.id)}
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {mainTab === "profit" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Proyeksi profit</h2>
            <p className="mt-1 text-sm text-slate-500">
              Profit = nilai PO − biaya. Rencana memakai total anggaran;
              aktual memakai pengeluaran yang sudah dicatat.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard
              label="Nilai PO"
              value={formatRp(nilaiPo)}
              tone="slate"
            />
            <SummaryCard
              label="Total anggaran"
              value={formatRp(plannedTotal)}
              tone="slate"
            />
            <SummaryCard
              label="Pengeluaran aktual"
              value={formatRp(totalExpense)}
              tone="amber"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Profit rencana
              </p>
              <p
                className={cn(
                  "mt-2 text-3xl font-bold tabular-nums",
                  profitRencana >= 0 ? "text-emerald-700" : "text-red-600"
                )}
              >
                {formatRp(profitRencana)}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Nilai PO − total anggaran
                {marginRencanaPct != null
                  ? ` · margin ${marginRencanaPct}%`
                  : ""}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Target jika pengeluaran tetap dalam plafon kategori.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Profit aktual (saat ini)
              </p>
              <p
                className={cn(
                  "mt-2 text-3xl font-bold tabular-nums",
                  profitAktual >= 0 ? "text-emerald-700" : "text-red-600"
                )}
              >
                {formatRp(profitAktual)}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Nilai PO − pengeluaran tercatat
                {marginAktualPct != null
                  ? ` · margin ${marginAktualPct}%`
                  : ""}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Masih bisa turun jika ada pengeluaran berikutnya.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-900">
              Status anggaran
            </h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Pemakaian anggaran</dt>
                <dd className="font-medium tabular-nums text-slate-900">
                  {budgetUsagePct != null ? `${budgetUsagePct}%` : "—"}
                  <span className="font-normal text-slate-400">
                    {" "}
                    ({formatRp(totalExpense)} / {formatRp(plannedTotal)})
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Sisa anggaran</dt>
                <dd
                  className={cn(
                    "font-medium tabular-nums",
                    sisaAnggaran >= 0 ? "text-emerald-700" : "text-red-600"
                  )}
                >
                  {formatRp(sisaAnggaran)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">
                  Profit jika anggaran habis dipakai
                </dt>
                <dd
                  className={cn(
                    "font-medium tabular-nums",
                    profitJikaAnggaranHabis >= 0
                      ? "text-emerald-700"
                      : "text-red-600"
                  )}
                >
                  {formatRp(profitJikaAnggaranHabis)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Sisa nilai PO vs terpakai</dt>
                <dd
                  className={cn(
                    "font-medium tabular-nums",
                    sisaVsPo >= 0 ? "text-slate-900" : "text-red-600"
                  )}
                >
                  {formatRp(sisaVsPo)}
                </dd>
              </div>
            </dl>

            {plannedTotal > nilaiPo && nilaiPo > 0 && (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Total anggaran ({formatRp(plannedTotal)}) lebih besar dari nilai
                PO — proyeksi profit rencana negatif / rugi.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">
              Kontribusi biaya per kategori
            </h3>
            <ul className="space-y-2">
              {activeCategories.map((cat) => {
                const planned = plannedByCat[cat.id] || 0;
                const used = actualByCat[cat.id] || 0;
                return (
                  <li
                    key={cat.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                  >
                    <span className="font-medium text-slate-800">
                      {cat.name}
                    </span>
                    <span className="tabular-nums text-slate-600">
                      anggaran {formatRp(planned)}
                      {" · "}
                      terpakai{" "}
                      <span className="text-amber-700">{formatRp(used)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <Modal
        open={catModal}
        onClose={() => setCatModal(false)}
        title={editingCat ? "Edit kategori" : "Kategori baru"}
      >
        <div className="space-y-3">
          <Input
            label="Nama kategori"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            placeholder="Contoh: Transport"
            required
          />
          {catError && <p className="text-sm text-red-600">{catError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCatModal(false)}>
              Batal
            </Button>
            <Button
              onClick={saveCategory}
              disabled={catBusy || !catName.trim()}
            >
              Simpan
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={expenseOpen}
        onClose={() => {
          setExpenseOpen(false);
          if (receiptPreview) URL.revokeObjectURL(receiptPreview);
          setReceiptFile(null);
          setReceiptPreview(null);
        }}
        title="Catat pengeluaran (di luar PO)"
        className="max-w-md"
      >
        <form onSubmit={createExpense} className="space-y-4">
          <p className="text-xs text-slate-500">
            Untuk belanja / reimburse yang tidak lewat Progress PO. Memotong
            sisa anggaran kategori yang dipilih.
          </p>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">
              Kategori anggaran
            </label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              value={expenseForm.categoryId}
              onChange={(e) =>
                setExpenseForm({
                  ...expenseForm,
                  categoryId: e.target.value,
                })
              }
              required
            >
              {activeCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <Input
            id="exp-note"
            label="Keterangan (apa yang dibeli)"
            value={expenseForm.note}
            onChange={(e) =>
              setExpenseForm({ ...expenseForm, note: e.target.value })
            }
            placeholder="Contoh: Kabel tambahan site / bensin"
            required
          />
          <Input
            id="exp-date"
            label="Tanggal"
            type="date"
            value={expenseForm.date}
            onChange={(e) =>
              setExpenseForm({ ...expenseForm, date: e.target.value })
            }
            required
          />
          <Input
            id="exp-amount"
            label="Nominal (Rp)"
            type="number"
            min={0}
            value={expenseForm.amount}
            onChange={(e) =>
              setExpenseForm({ ...expenseForm, amount: e.target.value })
            }
            required
            placeholder="1000000"
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">
              Bukti pembayaran <span className="text-red-600">*</span>
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              capture="environment"
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-dark"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                if (receiptPreview) URL.revokeObjectURL(receiptPreview);
                setReceiptFile(f);
                setReceiptPreview(f ? URL.createObjectURL(f) : null);
              }}
              required
            />
            {receiptPreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={receiptPreview}
                alt="Preview bukti"
                className="mt-2 max-h-48 w-full rounded-lg border border-slate-200 object-contain bg-slate-50"
              />
            )}
            <p className="text-xs text-slate-400">
              Foto bon toko atau bukti transfer (JPG/PNG).
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setExpenseOpen(false);
                if (receiptPreview) URL.revokeObjectURL(receiptPreview);
                setReceiptFile(null);
                setReceiptPreview(null);
              }}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={
                loading || !receiptFile || !expenseForm.note.trim()
              }
            >
              {loading ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "red" | "slate";
}) {
  const tones = {
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-red-700",
    slate: "text-slate-900",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <p className="text-xs text-slate-500 sm:text-sm">{label}</p>
      <p className={cn("mt-1 text-base font-bold sm:text-xl", tones[tone])}>
        {value}
      </p>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn, formatRp } from "@/lib/utils";

type BudgetCategory =
  | "MODAL_BARANG"
  | "JASA"
  | "PRELIM"
  | "EQUIPMENT"
  | "OPERATION"
  | "OTHER";

type OperationType = "GAJI_WORKER" | "KASBON" | "LAINNYA";

type MainTab = "ringkasan" | "breakdown" | "pemasukan" | "pengeluaran";

export interface CostItemRow {
  id: string;
  category: BudgetCategory;
  operationType?: OperationType | null;
  name: string;
  description?: string | null;
  amount: number;
  quantity?: number | null;
  unit?: string | null;
  date: string | Date;
  createdBy?: string | null;
}

export interface IncomeRow {
  id: string;
  name: string;
  description?: string | null;
  amount: number;
  date: string | Date;
  createdBy?: string | null;
}

export interface BudgetLineRow {
  id?: string;
  name: string;
  planned: number;
  note?: string | null;
  sortOrder?: number;
}

export interface BudgetData {
  projectId: string;
  totalValue: number;
  notes?: string | null;
  lines: BudgetLineRow[];
}

interface CostViewProps {
  projectId: string;
  budget: BudgetData;
  costs: CostItemRow[];
  incomes: IncomeRow[];
  canManage: boolean;
}

type DraftLine = {
  key: string;
  id?: string;
  name: string;
  planned: string;
};

const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  MODAL_BARANG: "Modal Barang",
  JASA: "Jasa",
  PRELIM: "Preliminary",
  EQUIPMENT: "Equipment",
  OPERATION: "Operation",
  OTHER: "Lainnya",
};

const CATEGORY_ORDER: BudgetCategory[] = [
  "MODAL_BARANG",
  "JASA",
  "PRELIM",
  "EQUIPMENT",
  "OPERATION",
  "OTHER",
];

const OP_LABELS: Record<OperationType, string> = {
  GAJI_WORKER: "Gaji Worker",
  KASBON: "Kasbon",
  LAINNYA: "Lainnya",
};

const MAIN_TABS: { key: MainTab; label: string }[] = [
  { key: "ringkasan", label: "Ringkasan" },
  { key: "breakdown", label: "Breakdown Anggaran" },
  { key: "pemasukan", label: "Pemasukan" },
  { key: "pengeluaran", label: "Pengeluaran" },
];

function toDraftLines(lines: BudgetLineRow[]): DraftLine[] {
  return lines.map((l, i) => ({
    key: l.id || `new-${i}-${l.name}`,
    id: l.id,
    name: l.name,
    planned: String(l.planned || ""),
  }));
}

export function CostView({
  projectId,
  budget: initialBudget,
  costs: initialCosts,
  incomes: initialIncomes,
  canManage,
}: CostViewProps) {
  const [mainTab, setMainTab] = useState<MainTab>("ringkasan");
  const [budget, setBudget] = useState(initialBudget);
  const [costs, setCosts] = useState(initialCosts);
  const [incomes, setIncomes] = useState(initialIncomes);

  const [totalDraft, setTotalDraft] = useState(
    String(initialBudget.totalValue || "")
  );
  const [linesDraft, setLinesDraft] = useState(
    toDraftLines(initialBudget.lines)
  );
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetMsg, setBudgetMsg] = useState("");

  const [expenseCat, setExpenseCat] = useState<BudgetCategory>("MODAL_BARANG");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [expenseForm, setExpenseForm] = useState({
    name: "",
    description: "",
    amount: "",
    quantity: "",
    unit: "",
    date: new Date().toISOString().slice(0, 10),
    operationType: "GAJI_WORKER" as OperationType,
  });

  const [incomeForm, setIncomeForm] = useState({
    name: "",
    description: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const totalExpense = costs.reduce((s, i) => s + i.amount, 0);
  const plannedTotal = budget.lines.reduce((s, l) => s + l.planned, 0);
  const cashBalance = totalIncome - totalExpense;
  const budgetRemaining = budget.totalValue - totalExpense;

  const actualByCat = useMemo(() => {
    const map = Object.fromEntries(
      CATEGORY_ORDER.map((c) => [c, 0])
    ) as Record<BudgetCategory, number>;
    for (const c of costs) map[c.category] = (map[c.category] || 0) + c.amount;
    return map;
  }, [costs]);

  const filteredExpenses = costs.filter((c) => c.category === expenseCat);

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
            id: l.id,
            name: l.name,
            planned: parseFloat(l.planned) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");
      setBudget({
        projectId: data.projectId,
        totalValue: data.totalValue,
        notes: data.notes,
        lines: data.lines,
      });
      setLinesDraft(toDraftLines(data.lines));
      setTotalDraft(String(data.totalValue));
      setBudgetMsg("Anggaran tersimpan");
    } catch (err) {
      setBudgetMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingBudget(false);
    }
  }

  async function createExpense(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/project/${projectId}/cost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: expenseCat,
          name: expenseForm.name,
          description: expenseForm.description,
          amount: expenseForm.amount,
          quantity: expenseForm.quantity || undefined,
          unit: expenseForm.unit || undefined,
          date: expenseForm.date,
          operationType:
            expenseCat === "OPERATION"
              ? expenseForm.operationType
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      setCosts((prev) => [data, ...prev]);
      setExpenseOpen(false);
      setExpenseForm({
        name: "",
        description: "",
        amount: "",
        quantity: "",
        unit: "",
        date: new Date().toISOString().slice(0, 10),
        operationType: "GAJI_WORKER",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function createIncome(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/project/${projectId}/income`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(incomeForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      setIncomes((prev) => [data, ...prev]);
      setIncomeOpen(false);
      setIncomeForm({
        name: "",
        description: "",
        amount: "",
        date: new Date().toISOString().slice(0, 10),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteExpense(id: string) {
    if (!confirm("Hapus pengeluaran ini?")) return;
    const res = await fetch(`/api/project/${projectId}/cost/${id}`, {
      method: "DELETE",
    });
    if (res.ok) setCosts((prev) => prev.filter((i) => i.id !== id));
  }

  async function deleteIncome(id: string) {
    if (!confirm("Hapus pemasukan ini?")) return;
    const res = await fetch(`/api/project/${projectId}/income/${id}`, {
      method: "DELETE",
    });
    if (res.ok) setIncomes((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MAIN_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setMainTab(t.key)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              mainTab === t.key
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50"
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {mainTab === "ringkasan" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">Nilai total project</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">
                  {formatRp(budget.totalValue)}
                </p>
              </div>
              {canManage && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setMainTab("breakdown")}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Atur anggaran
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard label="Pemasukan" value={formatRp(totalIncome)} tone="emerald" />
            <SummaryCard label="Pengeluaran" value={formatRp(totalExpense)} tone="amber" />
            <SummaryCard
              label="Saldo cashflow"
              value={formatRp(cashBalance)}
              tone={cashBalance >= 0 ? "emerald" : "red"}
            />
            <SummaryCard
              label="Sisa vs nilai project"
              value={formatRp(budgetRemaining)}
              tone={budgetRemaining >= 0 ? "slate" : "red"}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">
              Breakdown anggaran
            </h3>
            {budget.lines.length === 0 ? (
              <p className="text-sm text-slate-400">
                Belum ada item breakdown. Tambah di tab Breakdown Anggaran.
              </p>
            ) : (
              <div className="space-y-3">
                {budget.lines.map((line) => {
                  const share =
                    budget.totalValue > 0
                      ? Math.round(
                          (line.planned / budget.totalValue) * 1000
                        ) / 10
                      : 0;
                  return (
                    <div key={line.id || line.name}>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-slate-800">
                          {line.name}
                        </span>
                        <span className="text-slate-500">
                          {formatRp(line.planned)}
                          {budget.totalValue > 0 ? ` · ${share}%` : ""}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-slate-900"
                          style={{
                            width: `${Math.min(100, share)}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-4 text-xs text-slate-400">
              Total alokasi: {formatRp(plannedTotal)}
              {budget.totalValue > 0 &&
                ` · ${Math.round((plannedTotal / budget.totalValue) * 100)}% dari nilai project`}
              {" · "}
              Pengeluaran aktual: {formatRp(totalExpense)}
            </p>
          </div>
        </div>
      )}

      {mainTab === "breakdown" && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h2 className="font-semibold text-slate-900">
              Nilai & Breakdown Anggaran
            </h2>
            <p className="text-sm text-slate-500">
              Input nilai total project, lalu tambah item breakdown secara
              manual (nama + nilai).
            </p>
          </div>

          <Input
            id="total-value"
            label="Nilai total project (Rp)"
            type="number"
            min={0}
            value={totalDraft}
            onChange={(e) => setTotalDraft(e.target.value)}
            disabled={!canManage}
            placeholder="500000000"
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">
                Item breakdown
              </p>
              {canManage && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setLinesDraft((prev) => [
                      ...prev,
                      {
                        key: `new-${Date.now()}`,
                        name: "",
                        planned: "",
                      },
                    ])
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Tambah Item
                </Button>
              )}
            </div>

            {linesDraft.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400">
                Belum ada item. Klik &quot;Tambah Item&quot; untuk mulai.
              </div>
            ) : (
              linesDraft.map((line, idx) => (
                <div
                  key={line.key}
                  className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[1fr_160px_auto]"
                >
                  <Input
                    id={`name-${line.key}`}
                    label={idx === 0 ? "Nama item" : undefined}
                    value={line.name}
                    disabled={!canManage}
                    onChange={(e) => {
                      const next = [...linesDraft];
                      next[idx] = { ...line, name: e.target.value };
                      setLinesDraft(next);
                    }}
                    placeholder="Modal barang / Jasa / Prelim / dll"
                  />
                  <Input
                    id={`planned-${line.key}`}
                    label={idx === 0 ? "Nilai (Rp)" : undefined}
                    type="number"
                    min={0}
                    value={line.planned}
                    disabled={!canManage}
                    onChange={(e) => {
                      const next = [...linesDraft];
                      next[idx] = { ...line, planned: e.target.value };
                      setLinesDraft(next);
                    }}
                    placeholder="0"
                  />
                  {canManage && (
                    <button
                      type="button"
                      onClick={() =>
                        setLinesDraft((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      className={cn(
                        "rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600",
                        idx === 0 ? "mt-6" : "self-center"
                      )}
                      title="Hapus item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-500">
              Total breakdown:{" "}
              <span className="font-semibold text-slate-900">
                {formatRp(
                  linesDraft.reduce(
                    (s, l) => s + (parseFloat(l.planned) || 0),
                    0
                  )
                )}
              </span>
            </p>
            {canManage && (
              <Button onClick={saveBudget} disabled={savingBudget}>
                {savingBudget ? "Menyimpan..." : "Simpan Anggaran"}
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

      {mainTab === "pemasukan" && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="font-semibold text-slate-900">Pemasukan</h2>
              <p className="text-xs text-slate-500">
                Total: {formatRp(totalIncome)}
              </p>
            </div>
            {canManage && (
              <Button
                size="sm"
                onClick={() => {
                  setError("");
                  setIncomeOpen(true);
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Tambah
              </Button>
            )}
          </div>
          <CashTable
            rows={incomes.map((i) => ({
              id: i.id,
              date: i.date,
              name: i.name,
              description: i.description,
              amount: i.amount,
            }))}
            canManage={canManage}
            onDelete={deleteIncome}
            empty="Belum ada pemasukan"
          />
        </div>
      )}

      {mainTab === "pengeluaran" && (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATEGORY_ORDER.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setExpenseCat(cat)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
                  expenseCat === cat
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {CATEGORY_LABELS[cat]}
                <span className="ml-1.5 opacity-70">
                  {formatRp(actualByCat[cat] || 0)}
                </span>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="font-semibold text-slate-900">
                  {CATEGORY_LABELS[expenseCat]}
                </h2>
                <p className="text-xs text-slate-500">
                  Aktual kategori ini: {formatRp(actualByCat[expenseCat] || 0)}
                </p>
              </div>
              {canManage && (
                <Button
                  size="sm"
                  onClick={() => {
                    setError("");
                    setExpenseOpen(true);
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Tambah
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Tanggal</th>
                    <th className="px-4 py-3 font-medium">Nama</th>
                    {expenseCat === "OPERATION" && (
                      <th className="px-4 py-3 font-medium">Tipe</th>
                    )}
                    {(expenseCat === "MODAL_BARANG" ||
                      expenseCat === "EQUIPMENT") && (
                      <th className="px-4 py-3 font-medium">Qty</th>
                    )}
                    <th className="px-4 py-3 font-medium text-right">Jumlah</th>
                    {canManage && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-10 text-center text-slate-400"
                      >
                        Belum ada pengeluaran
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
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-slate-400">
                              {item.description}
                            </p>
                          )}
                        </td>
                        {expenseCat === "OPERATION" && (
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                              {item.operationType
                                ? OP_LABELS[item.operationType]
                                : "—"}
                            </span>
                          </td>
                        )}
                        {(expenseCat === "MODAL_BARANG" ||
                          expenseCat === "EQUIPMENT") && (
                          <td className="px-4 py-3 text-slate-600">
                            {item.quantity != null
                              ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
                              : "—"}
                          </td>
                        )}
                        <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                          {formatRp(item.amount)}
                        </td>
                        {canManage && (
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

      <Modal
        open={incomeOpen}
        onClose={() => setIncomeOpen(false)}
        title="Tambah Pemasukan"
      >
        <form onSubmit={createIncome} className="space-y-4">
          <Input
            id="inc-name"
            label="Nama"
            value={incomeForm.name}
            onChange={(e) =>
              setIncomeForm({ ...incomeForm, name: e.target.value })
            }
            required
            placeholder="Termin 1 / DP Client"
          />
          <Input
            id="inc-desc"
            label="Keterangan"
            value={incomeForm.description}
            onChange={(e) =>
              setIncomeForm({ ...incomeForm, description: e.target.value })
            }
            placeholder="Opsional"
          />
          <Input
            id="inc-amount"
            label="Jumlah (Rp)"
            type="number"
            min={0}
            value={incomeForm.amount}
            onChange={(e) =>
              setIncomeForm({ ...incomeForm, amount: e.target.value })
            }
            required
          />
          <Input
            id="inc-date"
            label="Tanggal"
            type="date"
            value={incomeForm.date}
            onChange={(e) =>
              setIncomeForm({ ...incomeForm, date: e.target.value })
            }
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIncomeOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              Simpan
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        title={`Tambah ${CATEGORY_LABELS[expenseCat]}`}
        className="max-w-lg"
      >
        <form onSubmit={createExpense} className="space-y-4">
          {expenseCat === "OPERATION" && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">
                Tipe
              </label>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={expenseForm.operationType}
                onChange={(e) =>
                  setExpenseForm({
                    ...expenseForm,
                    operationType: e.target.value as OperationType,
                  })
                }
              >
                {(Object.keys(OP_LABELS) as OperationType[]).map((op) => (
                  <option key={op} value={op}>
                    {OP_LABELS[op]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Input
            id="exp-name"
            label="Nama"
            value={expenseForm.name}
            onChange={(e) =>
              setExpenseForm({ ...expenseForm, name: e.target.value })
            }
            required
          />
          <Input
            id="exp-desc"
            label="Keterangan"
            value={expenseForm.description}
            onChange={(e) =>
              setExpenseForm({ ...expenseForm, description: e.target.value })
            }
          />
          {(expenseCat === "MODAL_BARANG" || expenseCat === "EQUIPMENT") && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                id="exp-qty"
                label="Quantity"
                type="number"
                min={0}
                step="any"
                value={expenseForm.quantity}
                onChange={(e) =>
                  setExpenseForm({ ...expenseForm, quantity: e.target.value })
                }
              />
              <Input
                id="exp-unit"
                label="Satuan"
                value={expenseForm.unit}
                onChange={(e) =>
                  setExpenseForm({ ...expenseForm, unit: e.target.value })
                }
                placeholder="pcs / kg"
              />
            </div>
          )}
          <Input
            id="exp-amount"
            label="Jumlah (Rp)"
            type="number"
            min={0}
            value={expenseForm.amount}
            onChange={(e) =>
              setExpenseForm({ ...expenseForm, amount: e.target.value })
            }
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setExpenseOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              Simpan
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

function CashTable({
  rows,
  canManage,
  onDelete,
  empty,
}: {
  rows: {
    id: string;
    date: string | Date;
    name: string;
    description?: string | null;
    amount: number;
  }[];
  canManage: boolean;
  onDelete: (id: string) => void;
  empty: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Tanggal</th>
            <th className="px-4 py-3 font-medium">Nama</th>
            <th className="px-4 py-3 font-medium text-right">Jumlah</th>
            {canManage && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-50 last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                  {new Date(row.date).toLocaleDateString("id-ID")}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{row.name}</p>
                  {row.description && (
                    <p className="text-xs text-slate-400">{row.description}</p>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                  {formatRp(row.amount)}
                </td>
                {canManage && (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onDelete(row.id)}
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
  );
}

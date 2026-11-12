"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import {
  Empty,
  LowStockBanner,
  PageHeader,
  formatQty,
  readError,
  useBusy,
  type InvCategory,
  type LowStockRow,
} from "./shared";

export interface RecapItemRow {
  id: string;
  category: InvCategory;
  name: string;
  code: string | null;
  unit: string;
  qty: number;
  minQty: number | null;
  notes: string | null;
  inQty: number;
  outQty: number;
  poQty: number | null;
}

interface Props {
  projectId: string;
  items: RecapItemRow[];
  lowStock: LowStockRow[];
  canManage: boolean;
  tabs: React.ReactNode;
}

const EMPTY_FORM = { name: "", code: "", unit: "pcs", minQty: "", notes: "" };

export function StockRecapView({ projectId, items, lowStock, canManage, tabs }: Props) {
  const router = useRouter();
  const { busy, error, setError, run } = useBusy();
  const [query, setQuery] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [editing, setEditing] = useState<RecapItemRow | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const lowIds = useMemo(() => new Set(lowStock.map((i) => i.id)), [lowStock]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (!q || i.name.toLowerCase().includes(q) || i.code?.toLowerCase().includes(q)) &&
        (!onlyLow || lowIds.has(i.id))
    );
  }, [items, query, onlyLow, lowIds]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setOpen(true);
  }

  function openEdit(item: RecapItemRow) {
    setEditing(item);
    setForm({
      name: item.name,
      code: item.code ?? "",
      unit: item.unit,
      minQty: item.minQty != null ? String(item.minQty) : "",
      notes: item.notes ?? "",
    });
    setError("");
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const payload = {
        name: form.name,
        code: form.code,
        unit: form.unit,
        minQty: form.minQty === "" ? null : Number(form.minQty),
        notes: form.notes,
      };
      const res = await fetch(
        editing
          ? `/api/project/${projectId}/inventory/item/${editing.id}`
          : `/api/project/${projectId}/inventory/item`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing ? payload : { ...payload, qty: 0 }),
        }
      );
      if (!res.ok) throw new Error(await readError(res, "Gagal simpan"));
      setOpen(false);
      router.refresh();
    });
  }

  async function remove(item: RecapItemRow) {
    if (!confirm(`Hapus barang "${item.name}"?`)) return;
    await run(async () => {
      const res = await fetch(
        `/api/project/${projectId}/inventory/item/${item.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(await readError(res, "Gagal hapus"));
      router.refresh();
    });
  }

  const sections: { category: InvCategory; title: string }[] = [
    { category: "MAIN", title: "Perangkat & Material utama (list PO)" },
    { category: "SUPPORT", title: "Material support" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rekap stok"
        subtitle="Acuan stok gudang proyek. Klik barang untuk melihat kartu stok (riwayat masuk/keluar)."
        actions={
          <>
            <Link
              href={`/project/${projectId}/inventory/ceklist`}
              className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Ceklist barang (lama)
            </Link>
            {canManage && (
              <Button onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" />
                Tambah material support
              </Button>
            )}
          </>
        }
      />

      {tabs}

      <LowStockBanner items={lowStock} />

      {error && !open && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari barang / kode"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-brand focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={onlyLow}
            onChange={(e) => setOnlyLow(e.target.checked)}
            className="rounded border-slate-300"
          />
          Hanya stok menipis
        </label>
      </div>

      {items.length === 0 ? (
        <Empty
          title="Belum ada barang"
          hint="Barang PO muncul otomatis dari Progress Kumulatif. Material support bisa ditambah di sini."
        />
      ) : (
        sections.map(({ category, title }) => {
          const rows = filtered.filter((i) => i.category === category);
          if (rows.length === 0) return null;
          return (
            <section key={category} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {title}
              </p>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Barang</th>
                      {category === "MAIN" && (
                        <th className="px-3 py-2.5 text-right font-medium">Qty PO</th>
                      )}
                      <th className="px-3 py-2.5 text-right font-medium">Masuk</th>
                      <th className="px-3 py-2.5 text-right font-medium">Keluar</th>
                      <th className="px-3 py-2.5 text-right font-medium">Sisa stok</th>
                      <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">
                        Min
                      </th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((item) => {
                      const low = lowIds.has(item.id);
                      const href = `/project/${projectId}/inventory/stok/${item.id}`;
                      return (
                        <tr
                          key={item.id}
                          onClick={() => router.push(href)}
                          className="cursor-pointer hover:bg-slate-50/80"
                        >
                          <td className="px-4 py-2.5">
                            <Link href={href} className="font-medium text-slate-900 hover:underline">
                              {item.name}
                            </Link>
                            <p className="text-xs text-slate-400">
                              {item.code && item.code !== item.name ? `${item.code} · ` : ""}
                              {item.unit}
                            </p>
                          </td>
                          {category === "MAIN" && (
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                              {item.poQty != null ? formatQty(item.poQty) : "—"}
                            </td>
                          )}
                          <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                            {formatQty(item.inQty)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-sky-700">
                            {formatQty(item.outQty)}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span
                              className={cn(
                                "font-semibold tabular-nums",
                                low ? "text-amber-700" : "text-slate-900"
                              )}
                            >
                              {formatQty(item.qty)}
                            </span>
                            {low && (
                              <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                Menipis
                              </span>
                            )}
                          </td>
                          <td className="hidden px-3 py-2.5 text-right tabular-nums text-slate-500 sm:table-cell">
                            {item.minQty != null ? formatQty(item.minQty) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div
                              className="inline-flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => openEdit(item)}
                                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
                                  title="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canManage && category === "SUPPORT" && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => remove(item)}
                                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                  title="Hapus"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <ChevronRight className="h-4 w-4 text-slate-300" />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : "Tambah material support"}
      >
        <form onSubmit={save} className="space-y-3">
          <Input
            id="item-name"
            label="Nama barang"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            disabled={editing?.category === "MAIN"}
            placeholder="Kabel ties 20cm"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="item-code"
              label="Kode (opsional)"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              disabled={editing?.category === "MAIN"}
            />
            <Input
              id="item-unit"
              label="Satuan"
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              required
              disabled={editing?.category === "MAIN"}
              placeholder="pcs / m / roll"
            />
          </div>
          <Input
            id="item-min"
            label="Stok minimum (notifikasi)"
            type="number"
            min={0}
            step="any"
            value={form.minQty}
            onChange={(e) => setForm((f) => ({ ...f, minQty: e.target.value }))}
            placeholder="Kosongkan bila tidak perlu notifikasi"
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Catatan</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          {!editing && (
            <p className="text-xs text-slate-500">
              Stok awal diisi lewat Barang masuk supaya tercatat di kartu stok.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

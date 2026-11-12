"use client";

import { useMemo, useState } from "react";
import {
  Check,
  FileText,
  ListChecks,
  Paperclip,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import {
  GOODS_NAME_MAX,
  GOODS_NOTES_MAX,
  GOODS_UNIT_MAX,
  RECEIPT_FILE_ACCEPT,
  RECEIPT_MAX_FILES,
  RECEIPT_NUMBER_MAX,
  isComplete,
  type GoodsChecklistRow,
  type GoodsReceiptRow,
} from "@/lib/goods-checklist";

interface Props {
  projectId: string;
  items: GoodsChecklistRow[];
  receipts: GoodsReceiptRow[];
  today: string;
  canManage: boolean;
  canRecord: boolean;
}

type Filter = "all" | "unpurchased" | "unarrived" | "complete";
type Tab = "items" | "receipts";

function fmtQty(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

function fmtDate(v: Date | string | null) {
  if (!v) return "";
  return new Date(v).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}

function fmtFullDate(v: Date | string) {
  return new Date(v).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function isPdf(url: string) {
  return url.toLowerCase().endsWith(".pdf");
}

export function GoodsChecklistView({
  projectId,
  items: initialItems,
  receipts: initialReceipts,
  today,
  canManage,
  canRecord,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [receipts, setReceipts] = useState(initialReceipts);
  const [tab, setTab] = useState<Tab>("items");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [itemOpen, setItemOpen] = useState(false);
  const [editing, setEditing] = useState<GoodsChecklistRow | null>(null);
  const [itemForm, setItemForm] = useState({ name: "", unit: "pcs", qty: "1", notes: "" });

  const [qtyItem, setQtyItem] = useState<GoodsChecklistRow | null>(null);
  const [purchasedForm, setPurchasedForm] = useState("0");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptPreselect, setReceiptPreselect] = useState<string[]>([]);
  const [historyItem, setHistoryItem] = useState<GoodsChecklistRow | null>(null);

  const receiptsByItem = useMemo(() => {
    const map = new Map<string, { receipt: GoodsReceiptRow; qty: number }[]>();
    for (const r of receipts) {
      for (const l of r.lines) {
        const list = map.get(l.itemId) ?? [];
        list.push({ receipt: r, qty: l.qty });
        map.set(l.itemId, list);
      }
    }
    return map;
  }, [receipts]);

  const stats = useMemo(() => {
    let purchased = 0;
    let arrived = 0;
    let complete = 0;
    for (const i of items) {
      const bought = isComplete(i.purchasedQty, i.qty);
      const there = isComplete(i.arrivedQty, i.qty);
      if (bought) purchased += 1;
      if (there) arrived += 1;
      if (bought && there) complete += 1;
    }
    return { total: items.length, purchased, arrived, complete };
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (q && !i.name.toLowerCase().includes(q)) return false;
      const bought = isComplete(i.purchasedQty, i.qty);
      const there = isComplete(i.arrivedQty, i.qty);
      if (filter === "unpurchased") return !bought;
      if (filter === "unarrived") return !there;
      if (filter === "complete") return bought && there;
      return true;
    });
  }, [items, filter, query]);

  function mergeItems(next: GoodsChecklistRow[]) {
    const byId = new Map(next.map((i) => [i.id, i]));
    setItems((prev) => prev.map((i) => byId.get(i.id) ?? i));
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/project/${projectId}/inventory/checklist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Gagal simpan");
    return data as GoodsChecklistRow;
  }

  async function togglePurchased(item: GoodsChecklistRow) {
    const done = isComplete(item.purchasedQty, item.qty);
    setBusyId(item.id);
    setError("");
    try {
      // Qty dibeli tidak boleh di bawah qty yang sudah sampai
      mergeItems([await patch(item.id, { purchasedQty: done ? item.arrivedQty : item.qty })]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal simpan");
    } finally {
      setBusyId(null);
    }
  }

  function openCreate() {
    setEditing(null);
    setItemForm({ name: "", unit: "pcs", qty: "1", notes: "" });
    setFormError("");
    setItemOpen(true);
  }

  function openEdit(item: GoodsChecklistRow) {
    setEditing(item);
    setItemForm({
      name: item.name,
      unit: item.unit,
      qty: String(item.qty),
      notes: item.notes || "",
    });
    setFormError("");
    setItemOpen(true);
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      const payload = {
        name: itemForm.name,
        unit: itemForm.unit,
        qty: Number(itemForm.qty),
        notes: itemForm.notes,
      };
      if (editing) {
        mergeItems([await patch(editing.id, payload)]);
      } else {
        const res = await fetch(`/api/project/${projectId}/inventory/checklist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Gagal tambah");
        setItems((prev) =>
          [...prev, data as GoodsChecklistRow].sort((a, b) =>
            a.name.localeCompare(b.name, "id")
          )
        );
      }
      setItemOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(item: GoodsChecklistRow) {
    const linked = receiptsByItem.get(item.id)?.length ?? 0;
    const warn = linked
      ? `\n\nBarang ini tercatat di ${linked} surat jalan; barisnya ikut terhapus.`
      : "";
    if (!confirm(`Hapus "${item.name}" dari ceklist?${warn}`)) return;
    setError("");
    const res = await fetch(
      `/api/project/${projectId}/inventory/checklist/${item.id}`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Gagal hapus");
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setReceipts((prev) =>
      prev
        .map((r) => ({ ...r, lines: r.lines.filter((l) => l.itemId !== item.id) }))
        .filter((r) => r.lines.length > 0)
    );
  }

  function openQty(item: GoodsChecklistRow) {
    setQtyItem(item);
    setPurchasedForm(String(item.purchasedQty));
    setFormError("");
  }

  async function saveQty(e: React.FormEvent) {
    e.preventDefault();
    if (!qtyItem) return;
    setSaving(true);
    setFormError("");
    try {
      mergeItems([await patch(qtyItem.id, { purchasedQty: Number(purchasedForm) })]);
      setQtyItem(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  function openReceipt(preselect: string[] = []) {
    setReceiptPreselect(preselect);
    setReceiptOpen(true);
  }

  function onReceiptSaved(receipt: GoodsReceiptRow, updated: GoodsChecklistRow[]) {
    setReceipts((prev) =>
      [receipt, ...prev].sort(
        (a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime() ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    );
    mergeItems(updated);
    setReceiptOpen(false);
  }

  async function deleteReceipt(receipt: GoodsReceiptRow) {
    if (
      !confirm(
        `Hapus surat jalan ${receipt.number}? Qty sampai lokasi untuk ${receipt.lines.length} barang akan dikurangi.`
      )
    ) {
      return;
    }
    setError("");
    const res = await fetch(
      `/api/project/${projectId}/inventory/checklist/receipt/${receipt.id}`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Gagal hapus surat jalan");
      return;
    }
    setReceipts((prev) => prev.filter((r) => r.id !== receipt.id));
    mergeItems(data.items || []);
  }

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Semua", count: stats.total },
    { id: "unpurchased", label: "Belum dibeli", count: stats.total - stats.purchased },
    { id: "unarrived", label: "Belum sampai", count: stats.total - stats.arrived },
    { id: "complete", label: "Lengkap", count: stats.complete },
  ];

  const canReceive = canRecord && stats.arrived < stats.total;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Ceklist Barang</h1>
          <p className="mt-1 text-sm text-slate-500">
            Centang barang yang sudah dibeli. Barang sampai lokasi dicatat lewat surat
            jalan beserta lampirannya, parsial maupun all-out.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canReceive && (
            <Button variant="secondary" onClick={() => openReceipt()}>
              <Truck className="mr-1.5 h-4 w-4" />
              Catat surat jalan
            </Button>
          )}
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Tambah barang
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total barang" value={String(stats.total)} />
        <Stat
          label="Sudah dibeli"
          value={`${stats.purchased}/${stats.total}`}
          pct={stats.total ? stats.purchased / stats.total : 0}
        />
        <Stat
          label="Sampai lokasi"
          value={`${stats.arrived}/${stats.total}`}
          pct={stats.total ? stats.arrived / stats.total : 0}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 py-14 text-center">
          <ListChecks className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">Belum ada barang</p>
          <p className="mt-1 max-w-sm text-xs text-slate-400">
            Tambah daftar barang yang dibutuhkan, lalu centang saat sudah dibeli dan
            catat surat jalan saat sampai lokasi.
          </p>
          {canManage && (
            <div className="mt-4">
              <Button size="sm" onClick={openCreate}>
                Tambah barang
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex gap-1 border-b border-slate-200">
            {(
              [
                { id: "items", label: "Barang", count: stats.total },
                { id: "receipts", label: "Surat jalan", count: receipts.length },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "border-brand text-brand"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                )}
              >
                {t.label}
                <span className="ml-1.5 text-xs text-slate-400">{t.count}</span>
              </button>
            ))}
          </div>

          {tab === "items" ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {filters.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilter(f.id)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                        filter === f.id
                          ? "border-brand bg-brand text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                      )}
                    >
                      {f.label}
                      <span
                        className={cn(
                          "ml-1.5",
                          filter === f.id ? "text-slate-300" : "text-slate-400"
                        )}
                      >
                        {f.count}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="relative sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cari barang…"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Barang</th>
                      <th className="px-4 py-3 text-right font-medium">Kebutuhan</th>
                      <th className="px-4 py-3 font-medium">Dibeli</th>
                      <th className="px-4 py-3 font-medium">Sampai lokasi</th>
                      <th className="px-4 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                          Tidak ada barang untuk filter ini.
                        </td>
                      </tr>
                    ) : (
                      visible.map((item) => {
                        const arrivedAll = isComplete(item.arrivedQty, item.qty);
                        const sjCount = receiptsByItem.get(item.id)?.length ?? 0;
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/60">
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900">{item.name}</p>
                              {item.notes && (
                                <p className="text-xs text-slate-400">{item.notes}</p>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700">
                              {fmtQty(item.qty)}
                              <span className="ml-1 text-xs text-slate-400">{item.unit}</span>
                            </td>
                            <td className="px-4 py-3">
                              <CheckCell
                                done={item.purchasedQty}
                                needed={item.qty}
                                at={item.purchasedAt}
                                by={item.purchasedBy}
                                disabled={!canRecord || busyId === item.id || arrivedAll}
                                onToggle={() => togglePurchased(item)}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <ArrivalCell
                                done={item.arrivedQty}
                                needed={item.qty}
                                at={item.arrivedAt}
                                by={item.arrivedBy}
                                sjCount={sjCount}
                                onOpen={sjCount ? () => setHistoryItem(item) : undefined}
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex gap-1">
                                {canRecord && !arrivedAll && (
                                  <IconButton
                                    title="Catat kedatangan (surat jalan)"
                                    onClick={() => openReceipt([item.id])}
                                  >
                                    <Truck className="h-3.5 w-3.5" />
                                  </IconButton>
                                )}
                                {canRecord && (
                                  <IconButton title="Atur qty dibeli" onClick={() => openQty(item)}>
                                    <SlidersHorizontal className="h-3.5 w-3.5" />
                                  </IconButton>
                                )}
                                {canManage && (
                                  <>
                                    <IconButton title="Edit barang" onClick={() => openEdit(item)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </IconButton>
                                    <IconButton
                                      title="Hapus"
                                      danger
                                      onClick={() => deleteItem(item)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </IconButton>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : receipts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
              <Truck className="mx-auto mb-3 h-9 w-9 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">Belum ada surat jalan</p>
              <p className="mt-1 text-xs text-slate-400">
                Catat surat jalan saat barang sampai di lokasi.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {receipts.map((r) => (
                <ReceiptCard
                  key={r.id}
                  receipt={r}
                  canDelete={canManage}
                  onDelete={() => deleteReceipt(r)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={itemOpen}
        onClose={() => setItemOpen(false)}
        title={editing ? "Edit barang" : "Tambah barang"}
      >
        <form onSubmit={saveItem} className="space-y-3">
          <Input
            id="gc-name"
            label="Nama barang"
            value={itemForm.name}
            onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
            required
            maxLength={GOODS_NAME_MAX}
            placeholder="Kabel NYA 2.5mm"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="gc-qty"
              label="Qty kebutuhan"
              type="number"
              min={0}
              step="any"
              value={itemForm.qty}
              onChange={(e) => setItemForm((f) => ({ ...f, qty: e.target.value }))}
              required
            />
            <Input
              id="gc-unit"
              label="Satuan"
              value={itemForm.unit}
              onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))}
              required
              maxLength={GOODS_UNIT_MAX}
              placeholder="pcs / m / roll"
            />
          </div>
          <div>
            <label htmlFor="gc-notes" className="mb-1 block text-sm font-medium text-slate-700">
              Catatan
            </label>
            <textarea
              id="gc-notes"
              value={itemForm.notes}
              onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              maxLength={GOODS_NOTES_MAX}
              placeholder="Opsional, mis. supplier atau spesifikasi"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setItemOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!qtyItem}
        onClose={() => setQtyItem(null)}
        title={qtyItem ? `Qty dibeli · ${qtyItem.name}` : "Qty dibeli"}
      >
        {qtyItem && (
          <form onSubmit={saveQty} className="space-y-3">
            <p className="text-sm text-slate-500">
              Kebutuhan{" "}
              <span className="font-semibold text-slate-900">
                {fmtQty(qtyItem.qty)} {qtyItem.unit}
              </span>
              . Tercentang otomatis saat qty mencapai kebutuhan.
              {qtyItem.arrivedQty > 0 && (
                <>
                  {" "}
                  Sudah sampai {fmtQty(qtyItem.arrivedQty)} {qtyItem.unit}, jadi qty dibeli
                  minimal sebesar itu.
                </>
              )}
            </p>
            <Input
              id="gc-purchased"
              label={`Sudah dibeli (${qtyItem.unit})`}
              type="number"
              min={qtyItem.arrivedQty}
              step="any"
              value={purchasedForm}
              onChange={(e) => setPurchasedForm(e.target.value)}
              required
            />
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setQtyItem(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Menyimpan…" : "Simpan"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {receiptOpen && (
        <ReceiptModal
          projectId={projectId}
          items={items}
          preselect={receiptPreselect}
          today={today}
          onClose={() => setReceiptOpen(false)}
          onSaved={onReceiptSaved}
        />
      )}

      <Modal
        open={!!historyItem}
        onClose={() => setHistoryItem(null)}
        title={historyItem ? `Kedatangan · ${historyItem.name}` : "Kedatangan"}
        className="sm:max-w-lg"
      >
        {historyItem && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Sampai{" "}
              <span className="font-semibold text-slate-900">
                {fmtQty(historyItem.arrivedQty)}/{fmtQty(historyItem.qty)} {historyItem.unit}
              </span>
            </p>
            {(receiptsByItem.get(historyItem.id) ?? []).map(({ receipt, qty }) => (
              <div key={receipt.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{receipt.number}</p>
                    <p className="text-xs text-slate-400">
                      {fmtFullDate(receipt.date)}
                      {receipt.createdBy ? ` · ${receipt.createdBy}` : ""}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900">
                    {fmtQty(qty)} {historyItem.unit}
                  </p>
                </div>
                <Attachments urls={receipt.attachmentUrls} />
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function ReceiptModal({
  projectId,
  items,
  preselect,
  today,
  onClose,
  onSaved,
}: {
  projectId: string;
  items: GoodsChecklistRow[];
  preselect: string[];
  today: string;
  onClose: () => void;
  onSaved: (receipt: GoodsReceiptRow, items: GoodsChecklistRow[]) => void;
}) {
  const open = useMemo(() => items.filter((i) => !isComplete(i.arrivedQty, i.qty)), [items]);
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [qtys, setQtys] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const id of preselect) {
      const item = items.find((i) => i.id === id);
      if (item) init[id] = String(Math.max(0, item.qty - item.arrivedQty));
    }
    return init;
  });
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = Object.entries(qtys).filter(([, v]) => v.trim() !== "");
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return open
      .filter((i) => !q || i.name.toLowerCase().includes(q) || qtys[i.id] !== undefined)
      .sort((a, b) => Number(qtys[b.id] !== undefined) - Number(qtys[a.id] !== undefined));
  }, [open, search, qtys]);

  function setQty(id: string, value: string | undefined) {
    setQtys((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, RECEIPT_MAX_FILES));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (files.length === 0) {
      setError("Lampirkan foto atau PDF surat jalan");
      return;
    }
    const lines = selected.map(([itemId, v]) => ({ itemId, qty: Number(v.replace(",", ".")) }));
    if (lines.length === 0) {
      setError("Isi qty minimal satu barang");
      return;
    }
    if (lines.some((l) => !Number.isFinite(l.qty) || l.qty <= 0)) {
      setError("Qty setiap barang harus lebih dari 0");
      return;
    }
    const fd = new FormData();
    fd.set("number", number);
    fd.set("date", date);
    fd.set("notes", notes);
    fd.set("lines", JSON.stringify(lines));
    for (const f of files) fd.append("files", f);

    setSaving(true);
    try {
      const res = await fetch(`/api/project/${projectId}/inventory/checklist/receipt`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal simpan surat jalan");
      onSaved(data.receipt, data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal simpan surat jalan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Catat surat jalan" className="sm:max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            id="sj-number"
            label="No. surat jalan"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            required
            maxLength={RECEIPT_NUMBER_MAX}
            placeholder="SJ/2026/10/001"
          />
          <Input
            id="sj-date"
            label="Tanggal sampai"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">
            Lampiran surat jalan <span className="text-red-500">*</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
              >
                <Paperclip className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="text-slate-400 hover:text-red-600"
                  aria-label="Hapus lampiran"
                >
                  ×
                </button>
              </span>
            ))}
            {files.length < RECEIPT_MAX_FILES && (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-500">
                <Plus className="h-3.5 w-3.5" />
                Foto / PDF
                <input
                  type="file"
                  accept={RECEIPT_FILE_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Maks {RECEIPT_MAX_FILES} file, JPG/PNG/WebP atau PDF.
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-700">
              Barang yang datang{" "}
              <span className="text-xs font-normal text-slate-400">
                ({selected.length} dipilih)
              </span>
            </p>
            <div className="relative w-48">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari barang…"
                className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-2 text-xs focus:border-slate-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {shown.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-400">
                Tidak ada barang yang belum sampai.
              </p>
            ) : (
              shown.map((item) => {
                const remaining = Math.max(0, item.qty - item.arrivedQty);
                const value = qtys[item.id];
                const on = value !== undefined;
                return (
                  <div
                    key={item.id}
                    className={cn("flex items-center gap-3 px-3 py-2", on && "bg-slate-50")}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        setQty(item.id, e.target.checked ? String(remaining) : undefined)
                      }
                      className="h-4 w-4 rounded border-slate-300"
                      aria-label={`Pilih ${item.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-400">
                        Sisa {fmtQty(remaining)} dari {fmtQty(item.qty)} {item.unit}
                      </p>
                    </div>
                    {on && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={remaining}
                          step="any"
                          value={value}
                          onChange={(e) => setQty(item.id, e.target.value)}
                          className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm tabular-nums focus:border-slate-500 focus:outline-none"
                          aria-label={`Qty ${item.name}`}
                        />
                        <span className="w-8 text-xs text-slate-400">{item.unit}</span>
                        <button
                          type="button"
                          onClick={() => setQty(item.id, String(remaining))}
                          className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:border-slate-400"
                          title="Isi semua sisa (all-out)"
                        >
                          Sisa
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div>
          <label htmlFor="sj-notes" className="mb-1 block text-sm font-medium text-slate-700">
            Catatan
          </label>
          <textarea
            id="sj-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={GOODS_NOTES_MAX}
            placeholder="Opsional, mis. ekspedisi atau penerima"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan surat jalan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiptCard({
  receipt,
  canDelete,
  onDelete,
}: {
  receipt: GoodsReceiptRow;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{receipt.number}</p>
          <p className="text-xs text-slate-400">
            {fmtFullDate(receipt.date)}
            {receipt.createdBy ? ` · dicatat ${receipt.createdBy}` : ""}
          </p>
        </div>
        {canDelete && (
          <IconButton title="Hapus surat jalan" danger onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        )}
      </div>
      <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">
        {receipt.lines.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
            <span className="min-w-0 truncate text-slate-700">{l.item.name}</span>
            <span className="whitespace-nowrap tabular-nums text-slate-900">
              {fmtQty(l.qty)} <span className="text-xs text-slate-400">{l.item.unit}</span>
            </span>
          </li>
        ))}
      </ul>
      {receipt.notes && <p className="mt-2 text-xs text-slate-500">{receipt.notes}</p>}
      <Attachments urls={receipt.attachmentUrls} />
    </div>
  );
}

function Attachments({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {urls.map((url, i) =>
        isPdf(url) ? (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-16 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:border-slate-400"
          >
            <FileText className="h-4 w-4 text-red-500" />
            PDF {urls.length > 1 ? i + 1 : ""}
          </a>
        ) : (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block h-16 w-16 overflow-hidden rounded-lg border border-slate-200 hover:border-slate-400"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Lampiran ${i + 1}`} className="h-full w-full object-cover" />
          </a>
        )
      )}
    </div>
  );
}

function IconButton({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "rounded p-1.5 text-slate-400",
        danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-slate-100 hover:text-slate-800"
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, pct }: { label: string; value: string; pct?: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <p className="text-xs text-slate-500 sm:text-sm">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
        {value}
      </p>
      {pct !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${Math.round(Math.min(1, pct) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function CheckCell({
  done,
  needed,
  at,
  by,
  disabled,
  onToggle,
}: {
  done: number;
  needed: number;
  at: Date | string | null;
  by: string | null;
  disabled: boolean;
  onToggle: () => void;
}) {
  const complete = isComplete(done, needed);
  const partial = !complete && done > 0;
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        role="checkbox"
        aria-checked={complete ? true : partial ? "mixed" : false}
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed",
          complete
            ? "border-brand bg-brand text-white"
            : partial
              ? "border-amber-500 bg-amber-50"
              : "border-slate-300 bg-white hover:border-slate-500",
          disabled && !complete && "opacity-60"
        )}
      >
        {complete && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        {partial && <span className="h-0.5 w-2.5 rounded bg-amber-500" />}
      </button>
      <QtyStamp done={done} needed={needed} at={at} by={by} />
    </div>
  );
}

function ArrivalCell({
  done,
  needed,
  at,
  by,
  sjCount,
  onOpen,
}: {
  done: number;
  needed: number;
  at: Date | string | null;
  by: string | null;
  sjCount: number;
  onOpen?: () => void;
}) {
  const complete = isComplete(done, needed);
  const partial = !complete && done > 0;
  return (
    <div className="flex items-center gap-2.5">
      <span
        role="img"
        aria-label={complete ? "Sampai semua" : partial ? "Sampai sebagian" : "Belum sampai"}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
          complete
            ? "border-brand bg-brand text-white"
            : partial
              ? "border-amber-500 bg-amber-50"
              : "border-slate-300 bg-white opacity-60"
        )}
      >
        {complete && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        {partial && <span className="h-0.5 w-2.5 rounded bg-amber-500" />}
      </span>
      <div className="min-w-0">
        <QtyStamp done={done} needed={needed} at={at} by={by} />
        {sjCount > 0 && onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900"
          >
            <Paperclip className="h-3 w-3" />
            {sjCount} surat jalan
          </button>
        )}
      </div>
    </div>
  );
}

function QtyStamp({
  done,
  needed,
  at,
  by,
}: {
  done: number;
  needed: number;
  at: Date | string | null;
  by: string | null;
}) {
  const complete = isComplete(done, needed);
  const partial = !complete && done > 0;
  return (
    <div className="min-w-0 leading-tight">
      <p
        className={cn(
          "text-sm tabular-nums",
          complete ? "font-medium text-slate-900" : partial ? "text-amber-700" : "text-slate-400"
        )}
      >
        {fmtQty(done)}/{fmtQty(needed)}
      </p>
      {complete && (by || at) && (
        <p className="truncate text-[11px] text-slate-400">
          {[by, fmtDate(at)].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

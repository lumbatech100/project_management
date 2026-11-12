"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  Empty,
  LowStockBanner,
  NoteList,
  PageHeader,
  PhotoInput,
  TabBtn,
  formatQty,
  readError,
  todayInput,
  useBusy,
  type InvCategory,
  type InvNote,
  type LowStockRow,
} from "./shared";

export interface MainItemRow {
  id: string;
  name: string;
  code: string | null;
  unit: string;
  poQty: number;
  received: number;
  poLines: { id: string; qty: number; received: number; notes: string | null }[];
}

export interface SupportItemRow {
  id: string;
  name: string;
  unit: string;
  qty: number;
}

interface Props {
  projectId: string;
  mainItems: MainItemRow[];
  supportItems: SupportItemRow[];
  notes: InvNote[];
  lowStock: LowStockRow[];
  canRecord: boolean;
  canManage: boolean;
}

const EMPTY_FORM = {
  number: "",
  date: todayInput(),
  partyName: "Lumbatech",
  vehicleNo: "",
  notes: "",
};

function noteCategory(n: InvNote): InvCategory {
  return n.category ?? n.lines[0]?.item.category ?? "SUPPORT";
}

export function InventoryInView({
  projectId,
  mainItems,
  supportItems,
  notes,
  lowStock,
  canRecord,
  canManage,
}: Props) {
  const router = useRouter();
  const { busy, error, setError, run } = useBusy();
  const [tab, setTab] = useState<InvCategory>("MAIN");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [mainLines, setMainLines] = useState<
    { key: string; itemId: string; quantity: string }[]
  >([]);
  const [supportLines, setSupportLines] = useState<
    { key: string; itemId: string; quantity: string }[]
  >([]);
  const [newItem, setNewItem] = useState<{ name: string; unit: string; minQty: string } | null>(null);

  const tabNotes = useMemo(
    () => notes.filter((n) => noteCategory(n) === tab),
    [notes, tab]
  );
  const mainTotals = useMemo(() => {
    const poQty = mainItems.reduce((s, i) => s + i.poQty, 0);
    const received = mainItems.reduce((s, i) => s + i.received, 0);
    return { poQty, received };
  }, [mainItems]);

  function openCreate() {
    setForm({ ...EMPTY_FORM, date: todayInput() });
    setFiles([]);
    setMainLines([{ key: String(Date.now()), itemId: "", quantity: "1" }]);
    setSupportLines([{ key: String(Date.now()), itemId: "", quantity: "1" }]);
    setNewItem(null);
    setError("");
    setOpen(true);
  }

  function fillAllRemaining() {
    const next = mainItems
      .filter((i) => i.poQty - i.received > 0)
      .map((i) => ({
        key: i.id,
        itemId: i.id,
        quantity: String(Math.max(0, i.poQty - i.received)),
      }));
    setMainLines(next.length ? next : [{ key: String(Date.now()), itemId: "", quantity: "1" }]);
  }

  async function addSupportItem() {
    if (!newItem?.name.trim()) return;
    await run(async () => {
      const res = await fetch(`/api/project/${projectId}/inventory/item`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newItem.name,
          unit: newItem.unit || "pcs",
          minQty: newItem.minQty === "" ? null : Number(newItem.minQty),
          qty: 0,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Gagal tambah barang"));
      const item = await res.json();
      setSupportLines((prev) => {
        const emptyIdx = prev.findIndex((l) => !l.itemId);
        if (emptyIdx >= 0) {
          return prev.map((l, i) => (i === emptyIdx ? { ...l, itemId: item.id } : l));
        }
        return [...prev, { key: String(Date.now()), itemId: item.id, quantity: "1" }];
      });
      setNewItem(null);
      router.refresh();
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const lines =
        tab === "MAIN"
          ? mainLines
              .map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) }))
              .filter((l) => l.itemId && l.quantity > 0)
          : supportLines
              .map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) }))
              .filter((l) => l.itemId && l.quantity > 0);
      if (lines.length === 0) throw new Error("Isi qty minimal 1 barang");
      if (files.length === 0) throw new Error("Foto surat jalan wajib diunggah");
      for (const l of lines) {
        const item = mainItems.find((i) => i.id === l.itemId);
        if (item && l.quantity > item.poQty - item.received + 1e-9) {
          throw new Error(`Qty ${item.name} melebihi sisa PO`);
        }
      }

      const fd = new FormData();
      fd.set("direction", "IN");
      fd.set("category", tab);
      fd.set("number", form.number);
      fd.set("date", form.date);
      fd.set("partyName", form.partyName);
      fd.set("vehicleNo", form.vehicleNo);
      fd.set("notes", form.notes);
      fd.set("lines", JSON.stringify(lines));
      files.forEach((f) => fd.append("photos", f));
      const res = await fetch(`/api/project/${projectId}/inventory/delivery`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(await readError(res, "Gagal simpan barang masuk"));
      setOpen(false);
      router.refresh();
    });
  }

  async function cancelNote(note: InvNote) {
    const msg =
      noteCategory(note) === "MAIN"
        ? `Batalkan ${note.number}? Stok gudang dan Progress Kumulatif akan dikurangi.`
        : `Batalkan ${note.number}? Stok gudang akan dikurangi.`;
    if (!confirm(msg)) return;
    await run(async () => {
      const res = await fetch(
        `/api/project/${projectId}/inventory/delivery/${note.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        }
      );
      if (!res.ok) throw new Error(await readError(res, "Gagal batalkan"));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Barang masuk"
        subtitle="Barang sampai di gudang proyek (material on site). Surat jalan dari Lumbatech wajib difoto."
        actions={
          canRecord ? (
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Catat barang masuk
            </Button>
          ) : null
        }
      />

      <LowStockBanner items={lowStock} />

      {error && !open && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        <TabBtn
          active={tab === "MAIN"}
          onClick={() => setTab("MAIN")}
          label="Perangkat & Material utama (PO)"
        />
        <TabBtn
          active={tab === "SUPPORT"}
          onClick={() => setTab("SUPPORT")}
          label="Material support"
        />
      </div>

      {tab === "MAIN" && mainItems.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Barang (list PO)</th>
                <th className="px-3 py-2.5 text-right font-medium">Qty PO</th>
                <th className="px-3 py-2.5 text-right font-medium">Sudah masuk</th>
                <th className="px-3 py-2.5 text-right font-medium">Sisa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mainItems.map((i) => {
                const sisa = Math.max(0, i.poQty - i.received);
                return (
                  <tr key={i.id}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-900">{i.name}</p>
                      {i.poLines.length > 1 && (
                        <p className="text-xs text-slate-400">
                          {i.poLines.length} baris PO:{" "}
                          {i.poLines.map((l) => formatQty(l.qty)).join(" + ")} {i.unit}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatQty(i.poQty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatQty(i.received)}</td>
                    <td
                      className={
                        sisa === 0
                          ? "px-3 py-2 text-right font-medium text-emerald-700"
                          : "px-3 py-2 text-right font-medium text-slate-900 tabular-nums"
                      }
                    >
                      {sisa === 0 ? "Lengkap" : `${formatQty(sisa)} ${i.unit}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-semibold">
              <tr>
                <td className="px-4 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatQty(mainTotals.poQty)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatQty(mainTotals.received)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatQty(Math.max(0, mainTotals.poQty - mainTotals.received))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {tab === "MAIN" && mainItems.length === 0 && (
        <Empty
          title="Belum ada barang di list PO"
          hint="Isi line tipe Barang di Progress Kumulatif dulu; barangnya otomatis muncul di sini."
        />
      )}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Riwayat surat jalan masuk
        </p>
        {tabNotes.length === 0 ? (
          <Empty
            title="Belum ada barang masuk"
            hint={
              tab === "MAIN"
                ? "Catat kedatangan perangkat & material utama sesuai list PO."
                : "Catat kedatangan material support / consumable."
            }
          />
        ) : (
          <NoteList
            notes={tabNotes}
            canRecord={canRecord}
            busy={busy}
            onCancel={cancelNote}
          />
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          tab === "MAIN"
            ? "Barang masuk — Perangkat & Material utama"
            : "Barang masuk — Material support"
        }
        className="sm:max-w-2xl"
      >
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="in-number"
              label="No. surat jalan (dari supplier)"
              value={form.number}
              onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
              required
              placeholder="Nomor SJ Lumbatech"
            />
            <Input
              id="in-date"
              label="Tanggal sampai gudang"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
            <Input
              id="in-party"
              label="Dari"
              value={form.partyName}
              onChange={(e) => setForm((f) => ({ ...f, partyName: e.target.value }))}
            />
            <Input
              id="in-vehicle"
              label="No. kendaraan (opsional)"
              value={form.vehicleNo}
              onChange={(e) => setForm((f) => ({ ...f, vehicleNo: e.target.value }))}
            />
          </div>

          {tab === "MAIN" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Barang PO</p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={fillAllRemaining}>
                    Isi semua sisa PO
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setMainLines((prev) => [
                        ...prev,
                        { key: String(Date.now()), itemId: "", quantity: "1" },
                      ])
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Baris
                  </Button>
                </div>
              </div>
              {mainLines.map((line, idx) => (
                <div key={line.key} className="flex gap-2">
                  <SearchSelect
                    value={line.itemId}
                    placeholder="Cari barang PO"
                    options={mainItems
                      .filter((i) => i.poQty - i.received > 0 || i.id === line.itemId)
                      .map((i) => ({
                        id: i.id,
                        label: `${i.name} (sisa ${formatQty(Math.max(0, i.poQty - i.received))} ${i.unit})`,
                      }))}
                    onChange={(itemId) =>
                      setMainLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, itemId } : l))
                      )
                    }
                  />
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={line.quantity}
                    onChange={(e) =>
                      setMainLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, quantity: e.target.value } : l))
                      )
                    }
                    className="w-24 rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  />
                  {mainLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setMainLines((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <p className="text-xs text-slate-500">
                Qty otomatis masuk ke Progress Kumulatif dan tidak boleh melebihi sisa PO.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Barang</p>
                <div className="flex gap-2">
                  {canManage && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setNewItem({ name: "", unit: "pcs", minQty: "" })}
                    >
                      + Barang baru
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setSupportLines((prev) => [
                        ...prev,
                        { key: String(Date.now()), itemId: "", quantity: "1" },
                      ])
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Baris
                  </Button>
                </div>
              </div>
              {newItem && (
                <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_6rem_6rem_auto]">
                  <input
                    placeholder="Nama barang"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    placeholder="Satuan"
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    placeholder="Stok min"
                    type="number"
                    min={0}
                    value={newItem.minQty}
                    onChange={(e) => setNewItem({ ...newItem, minQty: e.target.value })}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <div className="flex gap-1">
                    <Button type="button" size="sm" disabled={busy} onClick={addSupportItem}>
                      Tambah
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setNewItem(null)}>
                      Batal
                    </Button>
                  </div>
                </div>
              )}
              {supportItems.length === 0 && !newItem && (
                <p className="text-xs text-amber-700">
                  Belum ada master material support. Klik &quot;+ Barang baru&quot;.
                </p>
              )}
              {supportLines.map((line, idx) => (
                <div key={line.key} className="flex gap-2">
                  <SearchSelect
                    value={line.itemId}
                    placeholder="Cari barang"
                    options={supportItems.map((i) => ({
                      id: i.id,
                      label: `${i.name} (stok ${formatQty(i.qty)} ${i.unit})`,
                    }))}
                    onChange={(itemId) =>
                      setSupportLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, itemId } : l))
                      )
                    }
                  />
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={line.quantity}
                    onChange={(e) =>
                      setSupportLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, quantity: e.target.value } : l))
                      )
                    }
                    className="w-24 rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  />
                  {supportLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSupportLines((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Catatan</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          <PhotoInput files={files} onChange={setFiles} required />

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Menyimpan..." : "Simpan & update stok"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

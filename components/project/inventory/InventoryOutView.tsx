"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  DEST_LABEL,
  Empty,
  LowStockBanner,
  NoteList,
  PageHeader,
  PhotoInput,
  SuratJalanPreview,
  TabBtn,
  formatQty,
  readError,
  todayInput,
  useBusy,
  type InvNote,
  type LowStockRow,
} from "./shared";

type Dest = "SITE" | "OFFICE";

export interface OutItemRow {
  id: string;
  name: string;
  unit: string;
  qty: number;
  category: "MAIN" | "SUPPORT";
}

interface Props {
  projectId: string;
  projectName: string;
  items: OutItemRow[];
  notes: InvNote[];
  lowStock: LowStockRow[];
  canRecord: boolean;
}

export function InventoryOutView({
  projectId,
  projectName,
  items,
  notes,
  lowStock,
  canRecord,
}: Props) {
  const router = useRouter();
  const { busy, error, setError, run } = useBusy();
  const [tab, setTab] = useState<Dest>("SITE");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: todayInput(),
    partyName: "",
    vehicleNo: "",
    notes: "",
  });
  const [lines, setLines] = useState<{ key: string; itemId: string; quantity: string }[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<InvNote | null>(null);
  const [confirmNote, setConfirmNote] = useState<InvNote | null>(null);
  const [confirmFiles, setConfirmFiles] = useState<File[]>([]);

  const tabNotes = useMemo(
    () => notes.filter((n) => (n.destination ?? "SITE") === tab),
    [notes, tab]
  );
  const inStock = useMemo(() => items.filter((i) => i.qty > 0), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  function openCreate() {
    setForm({ date: todayInput(), partyName: "", vehicleNo: "", notes: "" });
    setLines([{ key: String(Date.now()), itemId: "", quantity: "1" }]);
    setFiles([]);
    setError("");
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const payload = lines
        .map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity) }))
        .filter((l) => l.itemId && l.quantity > 0);
      if (payload.length === 0) throw new Error("Pilih minimal 1 barang");
      for (const l of payload) {
        const item = byId.get(l.itemId);
        if (item && l.quantity > item.qty + 1e-9) {
          throw new Error(`Stok ${item.name} tidak cukup (tersedia ${formatQty(item.qty)})`);
        }
      }
      const fd = new FormData();
      fd.set("direction", "OUT");
      fd.set("destination", tab);
      fd.set("date", form.date);
      fd.set("partyName", form.partyName);
      fd.set("vehicleNo", form.vehicleNo);
      fd.set("notes", form.notes);
      fd.set("lines", JSON.stringify(payload));
      files.forEach((f) => fd.append("photos", f));
      const res = await fetch(`/api/project/${projectId}/inventory/delivery`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(await readError(res, "Gagal simpan barang keluar"));
      const note: InvNote = await res.json();
      setOpen(false);
      if (note.status === "DRAFT") setPreview(note);
      router.refresh();
    });
  }

  async function submitConfirm() {
    if (!confirmNote) return;
    await run(async () => {
      if (confirmFiles.length === 0) throw new Error("Foto surat jalan wajib diunggah");
      const fd = new FormData();
      fd.set("action", "confirm");
      confirmFiles.forEach((f) => fd.append("photos", f));
      const res = await fetch(
        `/api/project/${projectId}/inventory/delivery/${confirmNote.id}`,
        { method: "POST", body: fd }
      );
      if (!res.ok) throw new Error(await readError(res, "Gagal konfirmasi"));
      setConfirmNote(null);
      router.refresh();
    });
  }

  async function cancelNote(note: InvNote) {
    if (!confirm(`Batalkan ${note.number}? Stok gudang akan dikembalikan.`)) return;
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

  async function deleteNote(note: InvNote) {
    if (!confirm(`Hapus draft ${note.number}?`)) return;
    await run(async () => {
      const res = await fetch(
        `/api/project/${projectId}/inventory/delivery/${note.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(await readError(res, "Gagal hapus"));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Barang keluar"
        subtitle="Keluar dari gudang proyek ke site atau retur ke office. Surat jalan dirilis dari sini; stok berkurang setelah foto SJ diunggah."
        actions={
          canRecord ? (
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Barang keluar — {DEST_LABEL[tab]}
            </Button>
          ) : null
        }
      />

      <LowStockBanner items={lowStock} />

      {error && !open && !confirmNote && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        <TabBtn active={tab === "SITE"} onClick={() => setTab("SITE")} label="Ke site" />
        <TabBtn
          active={tab === "OFFICE"}
          onClick={() => setTab("OFFICE")}
          label="Retur ke office"
        />
      </div>

      {tabNotes.length === 0 ? (
        <Empty
          title={tab === "SITE" ? "Belum ada barang keluar ke site" : "Belum ada retur ke office"}
          hint="Buat surat jalan keluar, cetak, lalu unggah foto SJ yang sudah ditandatangani."
        />
      ) : (
        <NoteList
          notes={tabNotes}
          canRecord={canRecord}
          busy={busy}
          showPrint
          onPreview={setPreview}
          onConfirm={(n) => {
            setConfirmFiles([]);
            setError("");
            setConfirmNote(n);
          }}
          onCancel={cancelNote}
          onDelete={deleteNote}
        />
      )}

      <SuratJalanPreview
        note={preview}
        projectName={projectName}
        onClose={() => setPreview(null)}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Surat jalan keluar — ${DEST_LABEL[tab]}`}
        className="sm:max-w-xl"
      >
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="out-date"
              label="Tanggal"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
            <Input
              id="out-vehicle"
              label="No. kendaraan (opsional)"
              value={form.vehicleNo}
              onChange={(e) => setForm((f) => ({ ...f, vehicleNo: e.target.value }))}
            />
          </div>
          <Input
            id="out-party"
            label={tab === "SITE" ? "Detail tujuan (opsional)" : "Penerima di office (opsional)"}
            value={form.partyName}
            onChange={(e) => setForm((f) => ({ ...f, partyName: e.target.value }))}
            placeholder={tab === "SITE" ? "Mis. Lantai 5 / Panel room" : "Nama penerima"}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Barang</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { key: String(Date.now()), itemId: "", quantity: "1" },
                  ])
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Baris
              </Button>
            </div>
            {inStock.length === 0 && (
              <p className="text-xs text-amber-700">Belum ada stok di gudang.</p>
            )}
            {lines.map((line, idx) => (
              <div key={line.key} className="flex gap-2">
                <SearchSelect
                  value={line.itemId}
                  placeholder="Cari barang"
                  options={inStock.map((i) => ({
                    id: i.id,
                    label: `${i.name} (stok ${formatQty(i.qty)} ${i.unit})`,
                  }))}
                  onChange={(itemId) =>
                    setLines((prev) =>
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
                    setLines((prev) =>
                      prev.map((l, i) => (i === idx ? { ...l, quantity: e.target.value } : l))
                    )
                  }
                  className="w-24 rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                    className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Catatan</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          <PhotoInput
            files={files}
            onChange={setFiles}
            hint="Kosongkan bila SJ belum dicetak: tersimpan sebagai draft, cetak SJ, lalu unggah fotonya untuk konfirmasi."
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={busy || inStock.length === 0}>
              {busy
                ? "Menyimpan..."
                : files.length > 0
                  ? "Simpan & kurangi stok"
                  : "Simpan draft & cetak SJ"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!confirmNote}
        onClose={() => setConfirmNote(null)}
        title={`Konfirmasi ${confirmNote?.number ?? ""}`}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Unggah foto surat jalan yang sudah ditandatangani. Setelah dikonfirmasi,
            stok gudang berkurang.
          </p>
          <PhotoInput files={confirmFiles} onChange={setConfirmFiles} required />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmNote(null)}>
              Batal
            </Button>
            <Button disabled={busy || confirmFiles.length === 0} onClick={submitConfirm}>
              {busy ? "Menyimpan..." : "Konfirmasi"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

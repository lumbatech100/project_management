"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { Empty, formatDate, formatQty, readError, useBusy } from "./shared";

type Status = "REQUESTED" | "PURCHASING" | "DONE" | "REJECTED";

export interface ItemRequestRow {
  id: string;
  itemId: string | null;
  name: string;
  unit: string;
  qty: number;
  neededBy: string | Date | null;
  notes: string | null;
  status: Status;
  requestedBy: string | null;
  requestedById: string | null;
  handledBy: string | null;
  handledAt: string | Date | null;
  handlerNote: string | null;
  createdAt: string | Date;
}

interface Props {
  projectId: string;
  requests: ItemRequestRow[];
  items: { id: string; name: string; unit: string; qty: number }[];
  currentUserId: string;
  canRequest: boolean;
  canManage: boolean;
}

const STATUS_LABEL: Record<Status, string> = {
  REQUESTED: "Menunggu gudang",
  PURCHASING: "Sedang dibeli",
  DONE: "Selesai",
  REJECTED: "Ditolak",
};

const STATUS_CLASS: Record<Status, string> = {
  REQUESTED: "bg-amber-50 text-amber-800",
  PURCHASING: "bg-sky-50 text-sky-700",
  DONE: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-600",
};

const EMPTY_FORM = { itemId: "", name: "", unit: "pcs", qty: "1", neededBy: "", notes: "" };

export function ItemRequestView({
  projectId,
  requests,
  items,
  currentUserId,
  canRequest,
  canManage,
}: Props) {
  const router = useRouter();
  const { busy, error, setError, run } = useBusy();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showDone, setShowDone] = useState(false);

  const visible = useMemo(
    () =>
      requests.filter(
        (r) => showDone || r.status === "REQUESTED" || r.status === "PURCHASING"
      ),
    [requests, showDone]
  );

  function openCreate() {
    setForm(EMPTY_FORM);
    setError("");
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      const res = await fetch(`/api/project/${projectId}/inventory/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: form.itemId || null,
          name: form.name,
          unit: form.unit,
          qty: Number(form.qty),
          neededBy: form.neededBy || null,
          notes: form.notes,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Gagal kirim permintaan"));
      setOpen(false);
      router.refresh();
    });
  }

  async function setStatus(r: ItemRequestRow, status: Status) {
    let handlerNote: string | null = null;
    if (status === "REJECTED") {
      handlerNote = prompt("Alasan ditolak (opsional)") ?? null;
    }
    await run(async () => {
      const res = await fetch(
        `/api/project/${projectId}/inventory/request/${r.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, handlerNote }),
        }
      );
      if (!res.ok) throw new Error(await readError(res, "Gagal update"));
      router.refresh();
    });
  }

  async function remove(r: ItemRequestRow) {
    if (!confirm(`Hapus permintaan ${r.name}?`)) return;
    await run(async () => {
      const res = await fetch(
        `/api/project/${projectId}/inventory/request/${r.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(await readError(res, "Gagal hapus"));
      router.refresh();
    });
  }

  const selectedItem = items.find((i) => i.id === form.itemId);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          Barang dibutuhkan tapi tidak ada di gudang: SM mengajukan, petugas gudang
          yang membeli. Setelah barang datang, catat lewat Barang masuk.
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="rounded border-slate-300"
            />
            Tampilkan selesai/ditolak
          </label>
          {canRequest && (
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Buat permintaan
            </Button>
          )}
        </div>
      </div>

      {error && !open && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      {visible.length === 0 ? (
        <Empty title="Tidak ada permintaan aktif" hint="Permintaan barang dari SM muncul di sini." />
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => {
            const canDelete =
              r.status === "REQUESTED" && (canManage || r.requestedById === currentUserId);
            return (
              <li
                key={r.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">
                      {r.name} — {formatQty(r.qty)} {r.unit}
                    </p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        STATUS_CLASS[r.status]
                      )}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Diminta {r.requestedBy ?? "—"} · {formatDate(r.createdAt)}
                    {r.neededBy ? ` · dibutuhkan ${formatDate(r.neededBy)}` : ""}
                  </p>
                  {r.notes && <p className="mt-1 text-sm text-slate-700">{r.notes}</p>}
                  {r.handledBy && (
                    <p className="mt-1 text-xs text-slate-500">
                      Diproses {r.handledBy}
                      {r.handledAt ? ` · ${formatDate(r.handledAt)}` : ""}
                      {r.handlerNote ? ` · ${r.handlerNote}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canManage && r.status === "REQUESTED" && (
                    <Button size="sm" disabled={busy} onClick={() => setStatus(r, "PURCHASING")}>
                      Proses beli
                    </Button>
                  )}
                  {canManage && (r.status === "REQUESTED" || r.status === "PURCHASING") && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setStatus(r, "DONE")}
                      >
                        Selesai
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setStatus(r, "REJECTED")}
                      >
                        Tolak
                      </Button>
                    </>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => remove(r)}
                      className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Hapus"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Permintaan barang ke gudang">
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Barang di stok (opsional)
            </label>
            <select
              value={form.itemId}
              onChange={(e) => setForm((f) => ({ ...f, itemId: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">— Barang baru / belum ada di stok —</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} (stok {formatQty(i.qty)} {i.unit})
                </option>
              ))}
            </select>
          </div>
          {!form.itemId && (
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
              <Input
                id="req-name"
                label="Nama barang"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
              <Input
                id="req-unit"
                label="Satuan"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="req-qty"
              label={`Qty${selectedItem ? ` (${selectedItem.unit})` : ""}`}
              type="number"
              min={0.01}
              step="any"
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
              required
            />
            <Input
              id="req-needed"
              label="Dibutuhkan tanggal (opsional)"
              type="date"
              value={form.neededBy}
              onChange={(e) => setForm((f) => ({ ...f, neededBy: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Keterangan</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Untuk pekerjaan apa / lokasi"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Mengirim..." : "Kirim ke gudang"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Truck,
  Percent,
  Pencil,
  RefreshCw,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn, formatRp } from "@/lib/utils";
import {
  calcLineProgressPct,
  deliveredQty,
  resolveBobotUnitPct,
  type PoLineLike,
} from "@/lib/po-progress";
import { PO_LINE_TYPES, poLineTypeLabel } from "@/lib/po-types";

type PoLineType = "BARANG" | "JASA_INSTALASI" | "JASA_MILESTONE";

export type PoDeliveryRow = {
  id: string;
  date: string | Date;
  qty: number;
  suratJalan: string | null;
  notes: string | null;
  photoUrls: string[];
  createdBy: string | null;
  deliveryNoteLineId?: string | null;
  createdAt: string | Date;
};

export type PoLineRow = {
  id: string;
  name: string;
  code: string | null;
  groupName: string | null;
  type: PoLineType;
  qty: number;
  unit: string;
  unitPrice: number | null;
  amount: number | null;
  bobotPct: number;
  bobotUnitPct: number | null;
  progressPct: number;
  notes: string | null;
  sortOrder: number;
  deliveries: PoDeliveryRow[];
};

export type PurchaseOrderRow = {
  id: string;
  number: string;
  title: string | null;
  totalValue: number | null;
  notes: string | null;
  progressPct: number;
  bobotTotal: number;
  lines: PoLineRow[];
  createdAt: string | Date;
};

interface Props {
  projectId: string;
  projectName?: string;
  initialPos: PurchaseOrderRow[];
  canManage: boolean;
  canUpdate: boolean;
}

function formatDateShort(v: string | Date | null | undefined) {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ProgressPoView({
  projectId,
  projectName,
  initialPos,
  canManage,
  canUpdate,
}: Props) {
  const [pos, setPos] = useState(initialPos);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialPos[0]?.id ?? null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [poModal, setPoModal] = useState(false);
  const [poForm, setPoForm] = useState({
    number: "",
    title: "",
    totalValue: "",
    notes: "",
  });

  const [lineModal, setLineModal] = useState(false);
  const [editingLine, setEditingLine] = useState<PoLineRow | null>(null);
  const [lineForm, setLineForm] = useState({
    name: "",
    code: "",
    groupName: "",
    type: "BARANG" as PoLineType,
    qty: "1",
    unit: "Unit",
    unitPrice: "",
    amount: "",
    bobotPct: "0",
    bobotUnitPct: "",
    notes: "",
  });

  const [pctModal, setPctModal] = useState<PoLineRow | null>(null);
  const [pctValue, setPctValue] = useState("0");

  // 1 project = 1 PO, jadi default selalu PO yang ada
  const selected = useMemo(
    () => pos.find((p) => p.id === selectedId) ?? pos[0] ?? null,
    [pos, selectedId]
  );

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/project/${projectId}/po`);
    if (!res.ok) return;
    const data = (await res.json()) as PurchaseOrderRow[];
    setPos(data);
    if (selectedId && !data.some((p) => p.id === selectedId)) {
      setSelectedId(data[0]?.id ?? null);
    }
  }, [projectId, selectedId]);

  function applyPo(updated: PurchaseOrderRow) {
    setPos((prev) => {
      const i = prev.findIndex((p) => p.id === updated.id);
      if (i < 0) return [updated, ...prev];
      const next = [...prev];
      next[i] = updated;
      return next;
    });
    setSelectedId(updated.id);
  }

  async function createPo() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/project/${projectId}/po`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: poForm.number,
          title: poForm.title || null,
          totalValue: poForm.totalValue || null,
          notes: poForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal buat PO");
      applyPo(data);
      setPoModal(false);
      setPoForm({ number: "", title: "", totalValue: "", notes: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  async function deletePo(po: PurchaseOrderRow) {
    if (!confirm(`Hapus PO ${po.number}? Semua line & delivery ikut terhapus.`)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/project/${projectId}/po/${po.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal hapus");
      setPos((prev) => prev.filter((p) => p.id !== po.id));
      if (selectedId === po.id) {
        setSelectedId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  function openAddLine() {
    setEditingLine(null);
    setLineForm({
      name: "",
      code: "",
      groupName: "",
      type: "BARANG",
      qty: "1",
      unit: "Unit",
      unitPrice: "",
      amount: "",
      bobotPct: "0",
      bobotUnitPct: "",
      notes: "",
    });
    setLineModal(true);
  }

  function openEditLine(line: PoLineRow) {
    setEditingLine(line);
    const unitBobot =
      line.bobotUnitPct ??
      resolveBobotUnitPct({
        bobotUnitPct: line.bobotUnitPct,
        bobotPct: line.bobotPct,
        qty: line.qty,
      });
    setLineForm({
      name: line.name,
      code: line.code || "",
      groupName: line.groupName || "",
      type: line.type,
      qty: String(line.qty),
      unit: line.unit,
      unitPrice: line.unitPrice != null ? String(line.unitPrice) : "",
      amount: line.amount != null ? String(line.amount) : "",
      bobotPct: String(line.bobotPct),
      bobotUnitPct: unitBobot != null ? String(unitBobot) : "",
      notes: line.notes || "",
    });
    setLineModal(true);
  }

  async function saveLine() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: lineForm.name,
        code: lineForm.code || null,
        groupName: lineForm.groupName || null,
        type: lineForm.type,
        qty: lineForm.qty,
        unit: lineForm.unit,
        unitPrice: lineForm.unitPrice || null,
        amount: lineForm.amount || null,
        bobotPct: lineForm.bobotPct,
        bobotUnitPct: lineForm.bobotUnitPct || null,
        notes: lineForm.notes || null,
      };
      const url = editingLine
        ? `/api/project/${projectId}/po/${selected.id}/line/${editingLine.id}`
        : `/api/project/${projectId}/po/${selected.id}/lines`;
      const res = await fetch(url, {
        method: editingLine ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan line");
      applyPo(data);
      setLineModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  async function deleteLine(line: PoLineRow) {
    if (!selected) return;
    if (!confirm(`Hapus line "${line.name}"?`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/project/${projectId}/po/${selected.id}/line/${line.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal hapus");
      applyPo(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDelivery(line: PoLineRow, deliveryId: string) {
    if (!selected) return;
    if (!confirm("Hapus catatan delivery ini?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/project/${projectId}/po/${selected.id}/line/${line.id}/delivery/${deliveryId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal hapus");
      applyPo(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  async function savePct() {
    if (!selected || !pctModal) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/project/${projectId}/po/${selected.id}/line/${pctModal.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ progressPct: pctValue }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal update %");
      applyPo(data);
      setPctModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  const linesByGroup = useMemo(() => {
    if (!selected) return [] as { group: string; lines: PoLineRow[] }[];
    const map = new Map<string, PoLineRow[]>();
    for (const line of selected.lines) {
      const g = line.groupName?.trim() || "Lainnya";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(line);
    }
    return Array.from(map.entries()).map(([group, lines]) => ({
      group,
      lines,
    }));
  }, [selected]);

  return (
    <div className="w-full space-y-4 print:space-y-3">
      <div className="hidden print:block">
        <h1 className="text-xl font-bold text-slate-900">
          Progress Kumulatif
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {[projectName, selected?.number, selected?.title]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Dicetak{" "}
          {new Date().toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {selected ? ` · Progress ${selected.progressPct}%` : ""}
        </p>
      </div>

      <div className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Progress Kumulatif
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Progress kontrak berbobot nilai — barang via surat jalan, jasa via %
            milestone/instalasi. Terpisah dari progress checklist lapangan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refresh()}
            disabled={busy}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
            disabled={!selected}
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Cetak
          </Button>
          {canManage && pos.length === 0 && (
            <Button size="sm" onClick={() => setPoModal(true)} disabled={busy}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Buat PO
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">
          {error}
        </div>
      )}

      <div>
        {/* Data lama yang punya >1 PO tetap bisa dibuka — idealnya dipecah jadi project sendiri */}
        {pos.length > 1 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 print:hidden">
            <p className="text-sm text-amber-900">
              Project ini punya {pos.length} PO. Satu project sebaiknya satu PO —
              pisahkan sisanya jadi project sendiri.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pos.map((po) => (
                <button
                  key={po.id}
                  type="button"
                  onClick={() => setSelectedId(po.id)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                    selected?.id === po.id
                      ? "bg-brand text-white"
                      : "bg-white text-slate-700 hover:bg-slate-100"
                  )}
                >
                  {po.number}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {!selected ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-16 text-center">
              <p className="text-sm font-medium text-slate-600">
                Belum ada PO di project ini
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Buat PO-nya dulu, lalu isi line barang / jasa untuk mulai
                menghitung progress kontrak.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {selected.number}
                    </h2>
                    {selected.title && (
                      <p className="text-sm text-slate-600">{selected.title}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Bobot terisi {selected.bobotTotal}%
                      {selected.totalValue != null
                        ? ` · Nilai ${formatRp(selected.totalValue)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-lg bg-brand px-3 py-2 text-center text-white">
                      <p className="text-[10px] uppercase tracking-wide text-slate-300">
                        Progress
                      </p>
                      <p className="text-xl font-bold tabular-nums">
                        {selected.progressPct}%
                      </p>
                    </div>
                    {canManage && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="print:hidden"
                          onClick={openAddLine}
                          disabled={busy}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Line
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          className="print:hidden"
                          onClick={() => deletePo(selected)}
                          disabled={busy}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{
                      width: `${Math.min(100, selected.progressPct)}%`,
                    }}
                  />
                </div>
                {selected.bobotTotal > 0 &&
                  Math.abs(selected.bobotTotal - 100) > 0.5 && (
                    <p className="mt-2 text-xs text-amber-700">
                      Total bobot {selected.bobotTotal}% (ideal 100% seperti
                      Kurva S).
                    </p>
                  )}
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white print:overflow-visible print:rounded-none print:shadow-none">
                {selected.lines.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-slate-400">
                    Belum ada line. Tambah baris sesuai Kurva S / kontrak.
                  </p>
                ) : (
                  <div className="overflow-x-auto print:overflow-visible">
                    <table className="w-full min-w-[860px] text-left text-sm print:min-w-0">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                          <th className="px-3 py-2 font-medium">Item</th>
                          <th className="px-3 py-2 font-medium">Tipe</th>
                          <th className="px-3 py-2 font-medium text-right">
                            Qty
                          </th>
                          <th className="px-3 py-2 font-medium text-right">
                            Harga
                          </th>
                          <th className="px-3 py-2 font-medium text-right">
                            Nilai
                          </th>
                          <th className="px-3 py-2 font-medium text-right">
                            Bobot/unit
                          </th>
                          <th className="px-3 py-2 font-medium text-right">
                            Bobot
                          </th>
                          <th className="px-3 py-2 font-medium text-right">
                            Selesai
                          </th>
                          <th className="px-3 py-2 font-medium text-right print:hidden">
                            Aksi
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {linesByGroup.map(({ group, lines }) => (
                          <Fragment key={`g-${group}`}>
                            <tr className="bg-slate-50/80">
                              <td
                                colSpan={9}
                                className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                              >
                                {group}
                              </td>
                            </tr>
                            {lines.map((line) => {
                              const pct = calcLineProgressPct(
                                line as PoLineLike
                              );
                              const delivered =
                                line.type === "BARANG"
                                  ? deliveredQty(line)
                                  : null;
                              return (
                                <tr
                                  key={line.id}
                                  className="border-t border-slate-50"
                                >
                                  <td className="px-3 py-2.5">
                                    <p className="font-medium text-slate-900">
                                      {line.name}
                                    </p>
                                    {line.code && (
                                      <p className="text-[11px] text-slate-400">
                                        {line.code}
                                      </p>
                                    )}
                                    {line.type === "BARANG" &&
                                      delivered != null && (
                                        <p className="mt-0.5 text-[11px] text-slate-500">
                                          Diterima {delivered}/{line.qty}{" "}
                                          {line.unit}
                                        </p>
                                      )}
                                    {line.type === "JASA_INSTALASI" && (
                                      <p className="mt-0.5 text-[11px] text-slate-500">
                                        Otomatis dari progress lapangan
                                        (approved SM)
                                      </p>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 text-xs text-slate-600">
                                    {poLineTypeLabel(line.type)}
                                  </td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                                    {line.qty} {line.unit}
                                  </td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                                    {line.unitPrice != null
                                      ? formatRp(line.unitPrice)
                                      : "—"}
                                  </td>
                                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-800">
                                    {line.amount != null
                                      ? formatRp(line.amount)
                                      : "—"}
                                  </td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                                    {(() => {
                                      const u =
                                        line.bobotUnitPct ??
                                        resolveBobotUnitPct({
                                          bobotUnitPct: line.bobotUnitPct,
                                          bobotPct: line.bobotPct,
                                          qty: line.qty,
                                        });
                                      if (u == null) return "—";
                                      return u < 0.01
                                        ? `${u.toFixed(4)}%`
                                        : `${u}%`;
                                    })()}
                                  </td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                                    {line.bobotPct}%
                                  </td>
                                  <td className="px-3 py-2.5 text-right">
                                    <span
                                      className={cn(
                                        "inline-block rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                                        pct >= 100
                                          ? "bg-emerald-50 text-emerald-800"
                                          : pct > 0
                                            ? "bg-amber-50 text-amber-800"
                                            : "bg-slate-100 text-slate-600"
                                      )}
                                    >
                                      {pct}%
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 print:hidden">
                                    <div className="flex justify-end gap-1">
                                      {canUpdate &&
                                        line.type === "BARANG" && (
                                          <Link
                                            href={`/project/${projectId}/inventory/masuk`}
                                            title="Catat lewat Inventory › Barang masuk"
                                            className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-slate-900 hover:bg-slate-200"
                                          >
                                            <Truck className="h-3.5 w-3.5" />
                                          </Link>
                                        )}
                                      {canUpdate &&
                                        line.type === "JASA_MILESTONE" && (
                                          <Button
                                            size="sm"
                                            variant="secondary"
                                            title="Update %"
                                            onClick={() => {
                                              setPctModal(line);
                                              setPctValue(
                                                String(line.progressPct || 0)
                                              );
                                            }}
                                          >
                                            <Percent className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                      {canManage && (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => openEditLine(line)}
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => deleteLine(line)}
                                          >
                                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {selected.lines.some(
                (l) => l.type === "BARANG" && l.deliveries.length > 0
              ) && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                    Riwayat delivery (surat jalan)
                  </p>
                  <ul className="space-y-2">
                    {selected.lines
                      .filter((l) => l.type === "BARANG")
                      .flatMap((l) =>
                        l.deliveries.map((d) => ({ line: l, d }))
                      )
                      .map(({ line, d }) => (
                        <li
                          key={d.id}
                          className="flex flex-col gap-1 rounded-lg border border-slate-100 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 text-sm">
                            <p className="font-medium text-slate-900">
                              {line.name} · +{d.qty} {line.unit}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatDateShort(d.date)} · SJ{" "}
                              {d.suratJalan || "—"}
                              {d.createdBy ? ` · ${d.createdBy}` : ""}
                            </p>
                          </div>
                          {canUpdate && !d.deliveryNoteLineId && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="print:hidden"
                              onClick={() => deleteDelivery(line, d.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-600" />
                            </Button>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        open={poModal}
        onClose={() => setPoModal(false)}
        title="PO baru"
      >
        <div className="space-y-3">
          <Input
            label="Nomor PO"
            value={poForm.number}
            onChange={(e) =>
              setPoForm((f) => ({ ...f, number: e.target.value }))
            }
            placeholder="PO-001 / kontrak"
            required
          />
          <Input
            label="Judul (opsional)"
            value={poForm.title}
            onChange={(e) =>
              setPoForm((f) => ({ ...f, title: e.target.value }))
            }
          />
          <Input
            label="Nilai kontrak Rp (opsional)"
            type="number"
            value={poForm.totalValue}
            onChange={(e) =>
              setPoForm((f) => ({ ...f, totalValue: e.target.value }))
            }
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Catatan
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={2}
              value={poForm.notes}
              onChange={(e) =>
                setPoForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setPoModal(false)}>
              Batal
            </Button>
            <Button onClick={createPo} disabled={busy || !poForm.number.trim()}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={lineModal}
        onClose={() => setLineModal(false)}
        title={editingLine ? "Edit line" : "Tambah line"}
      >
        <div className="space-y-3">
          <Input
            label="Nama"
            value={lineForm.name}
            onChange={(e) =>
              setLineForm((f) => ({ ...f, name: e.target.value }))
            }
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Kode"
              value={lineForm.code}
              onChange={(e) =>
                setLineForm((f) => ({ ...f, code: e.target.value }))
              }
            />
            <Input
              label="Grup"
              value={lineForm.groupName}
              onChange={(e) =>
                setLineForm((f) => ({ ...f, groupName: e.target.value }))
              }
              placeholder="A Perangkat"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Tipe
            </label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={lineForm.type}
              onChange={(e) =>
                setLineForm((f) => ({
                  ...f,
                  type: e.target.value as PoLineType,
                }))
              }
            >
              {PO_LINE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {poLineTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Bobot total % (semua qty)"
              type="number"
              value={lineForm.bobotPct}
              onChange={(e) =>
                setLineForm((f) => ({ ...f, bobotPct: e.target.value }))
              }
            />
            <Input
              label="Bobot / 1 unit %"
              type="number"
              value={lineForm.bobotUnitPct}
              onChange={(e) =>
                setLineForm((f) => ({ ...f, bobotUnitPct: e.target.value }))
              }
              placeholder="Kosongkan = bobot ÷ qty"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Qty"
              type="number"
              value={lineForm.qty}
              onChange={(e) =>
                setLineForm((f) => ({ ...f, qty: e.target.value }))
              }
            />
            <Input
              label="Unit"
              value={lineForm.unit}
              onChange={(e) =>
                setLineForm((f) => ({ ...f, unit: e.target.value }))
              }
            />
            <div />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Harga satuan (Rp)"
              type="number"
              value={lineForm.unitPrice}
              onChange={(e) =>
                setLineForm((f) => ({ ...f, unitPrice: e.target.value }))
              }
            />
            <Input
              label="Nilai line (Rp)"
              type="number"
              value={lineForm.amount}
              onChange={(e) =>
                setLineForm((f) => ({ ...f, amount: e.target.value }))
              }
              placeholder="Kosongkan = qty × harga"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setLineModal(false)}>
              Batal
            </Button>
            <Button
              onClick={saveLine}
              disabled={busy || !lineForm.name.trim()}
            >
              Simpan
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!pctModal}
        onClose={() => setPctModal(null)}
        title={`Update % — ${pctModal?.name || ""}`}
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Milestone (prelim, testing, engineering): isi % selesai / BA.
          </p>
          <Input
            label="Progress %"
            type="number"
            min={0}
            max={100}
            value={pctValue}
            onChange={(e) => setPctValue(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setPctModal(null)}>
              Batal
            </Button>
            <Button onClick={savePct} disabled={busy}>
              Simpan
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

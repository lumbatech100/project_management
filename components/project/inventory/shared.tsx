"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Eye,
  FileImage,
  Package,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { buildSuratJalanHtml } from "@/lib/delivery-note-format";
import { RECEIPT_FILE_ACCEPT } from "@/lib/goods-checklist";
import { cn } from "@/lib/utils";

export type InvCategory = "MAIN" | "SUPPORT";

export interface InvNoteLine {
  id: string;
  itemId: string;
  quantity: number;
  notes?: string | null;
  item: {
    id: string;
    name: string;
    unit: string;
    code?: string | null;
    category: InvCategory;
  };
}

export interface InvNote {
  id: string;
  number: string;
  direction: "IN" | "OUT";
  category?: InvCategory | null;
  destination?: "SITE" | "OFFICE" | null;
  status: "DRAFT" | "CONFIRMED" | "CANCELLED";
  date: string | Date;
  partyName?: string | null;
  vehicleNo?: string | null;
  notes?: string | null;
  photoUrls: string[];
  createdBy?: string | null;
  confirmedBy?: string | null;
  lines: InvNoteLine[];
}

export interface LowStockRow {
  id: string;
  name: string;
  unit: string;
  qty: number;
  minQty: number | null;
}

export const DEST_LABEL = { SITE: "Site", OFFICE: "Retur ke office" } as const;

export function formatDate(v: string | Date) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatQty(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export function todayInput() {
  const d = new Date(Date.now() + 7 * 3600_000);
  return d.toISOString().slice(0, 10);
}

export async function readError(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  return (data as { error?: string }).error || fallback;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function LowStockBanner({ items }: { items: LowStockRow[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p>
          <span className="font-semibold">{items.length}</span> barang di bawah
          stok minimum:
        </p>
        <p className="mt-0.5 text-xs text-amber-800">
          {items
            .slice(0, 8)
            .map((i) => `${i.name} (${formatQty(i.qty)}/${formatQty(i.minQty ?? 0)} ${i.unit})`)
            .join(" · ")}
          {items.length > 8 ? ` · +${items.length - 8} lainnya` : ""}
        </p>
      </div>
    </div>
  );
}

export function TabBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-brand text-brand"
          : "border-transparent text-slate-500 hover:text-slate-800"
      )}
    >
      {label}
    </button>
  );
}

export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 py-14 text-center">
      <Package className="mb-3 h-10 w-10 text-slate-300" />
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-slate-400">{hint}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PhotoInput({
  files,
  onChange,
  required,
  hint,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        Foto surat jalan{" "}
        {required ? <span className="text-red-600">*</span> : "(opsional)"}
      </label>
      <input
        type="file"
        accept={RECEIPT_FILE_ACCEPT}
        capture="environment"
        multiple
        onChange={(e) => onChange(Array.from(e.target.files ?? []))}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
      />
      <p className="mt-1 text-xs text-slate-400">
        {files.length > 0
          ? `${files.length} file dipilih`
          : hint || "Foto/PDF surat jalan, maks 5 file."}
      </p>
    </div>
  );
}

export function NoteStatusBadge({ status }: { status: InvNote["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium",
        status === "CONFIRMED" && "bg-emerald-50 text-emerald-700",
        status === "DRAFT" && "bg-slate-100 text-slate-600",
        status === "CANCELLED" && "bg-red-50 text-red-600"
      )}
    >
      {status === "CONFIRMED"
        ? "Confirmed"
        : status === "DRAFT"
          ? "Draft · belum ada foto SJ"
          : "Dibatalkan"}
    </span>
  );
}

export function SuratJalanPreview({
  note,
  projectName,
  onClose,
}: {
  note: InvNote | null;
  projectName: string;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!note}
      onClose={onClose}
      title={note ? `Surat Jalan ${note.number}` : "Surat Jalan"}
      className="sm:max-w-3xl"
    >
      {note && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const w = window.open("", "_blank");
                if (!w) return;
                w.document.write(buildSuratJalanHtml({ projectName, note }));
                w.document.close();
                w.focus();
                w.print();
              }}
            >
              <Printer className="mr-1 h-3.5 w-3.5" />
              Print
            </Button>
          </div>
          <iframe
            title="Preview surat jalan"
            className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white"
            srcDoc={buildSuratJalanHtml({ projectName, note })}
          />
        </div>
      )}
    </Modal>
  );
}

export function NoteList({
  notes,
  canRecord,
  busy,
  showPrint,
  onPreview,
  onConfirm,
  onCancel,
  onDelete,
}: {
  notes: InvNote[];
  canRecord: boolean;
  busy: boolean;
  showPrint?: boolean;
  onPreview?: (n: InvNote) => void;
  onConfirm?: (n: InvNote) => void;
  onCancel: (n: InvNote) => void;
  onDelete?: (n: InvNote) => void;
}) {
  return (
    <ul className="space-y-3">
      {notes.map((note) => (
        <li
          key={note.id}
          className={cn(
            "rounded-xl border border-slate-200 bg-white px-4 py-3",
            note.status === "CANCELLED" && "opacity-60"
          )}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-900">{note.number}</p>
                <NoteStatusBadge status={note.status} />
                {note.destination && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                    → {DEST_LABEL[note.destination]}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {formatDate(note.date)}
                {note.partyName ? ` · ${note.partyName}` : ""}
                {note.vehicleNo ? ` · ${note.vehicleNo}` : ""}
                {note.createdBy ? ` · dicatat ${note.createdBy}` : ""}
              </p>
              <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
                {note.lines.map((l) => (
                  <li key={l.id}>
                    {l.item.name} —{" "}
                    <span className="font-medium">{formatQty(l.quantity)}</span>{" "}
                    {l.item.unit}
                  </li>
                ))}
              </ul>
              {note.notes && (
                <p className="mt-1 text-xs text-slate-500">{note.notes}</p>
              )}
              {note.photoUrls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {note.photoUrls.map((url, i) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      <FileImage className="h-3.5 w-3.5" />
                      Foto SJ {note.photoUrls.length > 1 ? i + 1 : ""}
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {showPrint && onPreview && (
                <Button size="sm" variant="secondary" onClick={() => onPreview(note)}>
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  Lihat / cetak SJ
                </Button>
              )}
              {canRecord && note.status === "DRAFT" && (
                <>
                  {onConfirm && (
                    <Button size="sm" disabled={busy} onClick={() => onConfirm(note)}>
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Upload foto & konfirmasi
                    </Button>
                  )}
                  {onDelete && (
                    <Button size="sm" variant="secondary" onClick={() => onDelete(note)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Hapus
                    </Button>
                  )}
                </>
              )}
              {canRecord && note.status === "CONFIRMED" && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onCancel(note)}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Batalkan
                </Button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PrintButton() {
  return (
    <Button size="sm" variant="secondary" className="print:hidden" onClick={() => window.print()}>
      <Printer className="mr-1 h-3.5 w-3.5" />
      Cetak
    </Button>
  );
}

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

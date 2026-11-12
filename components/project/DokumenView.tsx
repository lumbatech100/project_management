"use client";

import { useMemo, useRef, useState } from "react";
import {
  Plus,
  FolderOpen,
  FileText,
  Download,
  Pencil,
  Trash2,
  Upload,
  Search,
  X,
  Eye,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

export type DocCategory =
  | "PERJANJIAN"
  | "TENDER"
  | "KONTRAK"
  | "LEGAL"
  | "TEKNIS"
  | "LAINNYA";

export interface DocumentRow {
  id: string;
  title: string;
  category: DocCategory;
  description?: string | null;
  fileUrl: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes: number;
  uploadedBy?: string | null;
  createdAt: string | Date;
}

const CATEGORIES: { value: DocCategory; label: string }[] = [
  { value: "PERJANJIAN", label: "Surat perjanjian" },
  { value: "TENDER", label: "Dokumen tender" },
  { value: "KONTRAK", label: "Kontrak" },
  { value: "LEGAL", label: "Legal / perizinan" },
  { value: "TEKNIS", label: "Teknis / spek" },
  { value: "LAINNYA", label: "Lainnya" },
];

function categoryLabel(c: DocCategory) {
  return CATEGORIES.find((x) => x.value === c)?.label || c;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(v: string | Date) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isPdfDoc(doc: DocumentRow) {
  const mime = (doc.mimeType || "").toLowerCase();
  const name = doc.fileName.toLowerCase();
  const url = doc.fileUrl.toLowerCase();
  return (
    mime.includes("pdf") || name.endsWith(".pdf") || url.endsWith(".pdf")
  );
}

function isImageDoc(doc: DocumentRow) {
  const mime = (doc.mimeType || "").toLowerCase();
  const name = doc.fileName.toLowerCase();
  return (
    mime.startsWith("image/") ||
    /\.(jpe?g|png|webp)$/i.test(name)
  );
}

function canPreviewDoc(doc: DocumentRow) {
  return isPdfDoc(doc) || isImageDoc(doc);
}

interface Props {
  projectId: string;
  documents: DocumentRow[];
  canManage: boolean;
}

export function DokumenView({
  projectId,
  documents: initial,
  canManage,
}: Props) {
  const [docs, setDocs] = useState(initial);
  const [filter, setFilter] = useState<DocCategory | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentRow | null>(null);
  const [preview, setPreview] = useState<DocumentRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocCategory>("PERJANJIAN");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (filter !== "ALL" && d.category !== filter) return false;
      if (!q) return true;
      const hay = [
        d.title,
        d.fileName,
        d.description || "",
        d.uploadedBy || "",
        categoryLabel(d.category),
        d.category,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [docs, filter, query]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: docs.length };
    for (const c of CATEGORIES) map[c.value] = 0;
    for (const d of docs) map[d.category] = (map[d.category] || 0) + 1;
    return map;
  }, [docs]);

  const hasActiveSearch = query.trim().length > 0;

  function openCreate() {
    setEditing(null);
    setTitle("");
    setCategory("PERJANJIAN");
    setDescription("");
    setFile(null);
    setError("");
    setOpen(true);
  }

  function openEdit(doc: DocumentRow) {
    setEditing(doc);
    setTitle(doc.title);
    setCategory(doc.category);
    setDescription(doc.description || "");
    setFile(null);
    setError("");
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (editing) {
        const res = await fetch(
          `/api/project/${projectId}/document/${editing.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, category, description }),
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal simpan");
        setDocs((prev) => prev.map((d) => (d.id === data.id ? data : d)));
      } else {
        if (!file) throw new Error("Pilih file terlebih dahulu");
        const form = new FormData();
        form.append("file", file);
        form.append("title", title || file.name);
        form.append("category", category);
        form.append("description", description);
        const res = await fetch(`/api/project/${projectId}/document`, {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal upload");
        setDocs((prev) => [data, ...prev]);
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function remove(doc: DocumentRow) {
    if (!confirm(`Hapus dokumen "${doc.title}"?`)) return;
    setError("");
    const res = await fetch(
      `/api/project/${projectId}/document/${doc.id}`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Gagal hapus");
      return;
    }
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dokumen Project</h1>
          <p className="mt-1 text-sm text-slate-500">
            Arsip perjanjian, tender, kontrak, legal, dan file pendukung.
            Surat jalan tetap di menu Inventory.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="mr-1.5 h-4 w-4" />
            Upload dokumen
          </Button>
        )}
      </div>

      {error && !open && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari judul, nama file, keterangan, atau pengunggah…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none"
          aria-label="Cari dokumen"
        />
        {hasActiveSearch && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Hapus pencarian"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <FilterChip
          active={filter === "ALL"}
          label={`Semua (${counts.ALL || 0})`}
          onClick={() => setFilter("ALL")}
        />
        {CATEGORIES.map((c) => (
          <FilterChip
            key={c.value}
            active={filter === c.value}
            label={`${c.label} (${counts[c.value] || 0})`}
            onClick={() => setFilter(c.value)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 py-16 text-center">
          <FolderOpen className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">
            {hasActiveSearch || filter !== "ALL"
              ? "Tidak ada dokumen yang cocok"
              : "Belum ada dokumen"}
          </p>
          <p className="mt-1 max-w-sm text-xs text-slate-400">
            {hasActiveSearch
              ? `Tidak ditemukan hasil untuk “${query.trim()}”. Coba kata kunci lain atau hapus filter.`
              : filter !== "ALL"
                ? "Belum ada dokumen di kategori ini."
                : "Upload surat perjanjian, file tender, kontrak, atau dokumen pendukung project."}
          </p>
          {hasActiveSearch ? (
            <Button
              size="sm"
              variant="secondary"
              className="mt-4"
              onClick={() => setQuery("")}
            >
              Hapus pencarian
            </Button>
          ) : (
            canManage &&
            filter === "ALL" && (
              <Button size="sm" className="mt-4" onClick={openCreate}>
                <Upload className="mr-1 h-3.5 w-3.5" />
                Upload pertama
              </Button>
            )
          )}
        </div>
      ) : (
        <>
          {hasActiveSearch && (
            <p className="text-xs text-slate-500">
              Menampilkan {filtered.length} dari {docs.length} dokumen
            </p>
          )}
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {filtered.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {doc.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {categoryLabel(doc.category)} · {doc.fileName} ·{" "}
                    {formatBytes(doc.sizeBytes)}
                  </p>
                  {doc.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                      {doc.description}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">
                    {formatDate(doc.createdAt)}
                    {doc.uploadedBy ? ` · ${doc.uploadedBy}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {canPreviewDoc(doc) ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPreview(doc)}
                  >
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    Preview
                  </Button>
                ) : null}
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {canPreviewDoc(doc) ? (
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                  ) : (
                    <Download className="mr-1 h-3.5 w-3.5" />
                  )}
                  {canPreviewDoc(doc) ? "Tab baru" : "Unduh"}
                </a>
                {canManage && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openEdit(doc)}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => remove(doc)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Hapus
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        </>
      )}

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.title || "Preview dokumen"}
        className="sm:max-w-5xl"
      >
        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span className="truncate">
                {preview.fileName} · {formatBytes(preview.sizeBytes)}
              </span>
              <a
                href={preview.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-slate-700 underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Buka di tab baru
              </a>
            </div>
            {isPdfDoc(preview) ? (
              <iframe
                title={preview.title}
                src={`${preview.fileUrl}#toolbar=1&navpanes=0`}
                className="h-[min(75vh,720px)] w-full rounded-lg border border-slate-200 bg-slate-50"
              />
            ) : isImageDoc(preview) ? (
              <div className="flex max-h-[min(75vh,720px)] items-center justify-center overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.fileUrl}
                  alt={preview.title}
                  className="max-h-[min(75vh,700px)] max-w-full object-contain"
                />
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">
                Format ini belum bisa di-preview di browser.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit dokumen" : "Upload dokumen"}
      >
        <form onSubmit={submit} className="space-y-4">
          <Input
            id="doc-title"
            label="Judul"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Contoh: Surat Perjanjian Kerja Sama"
            required={!editing}
          />
          <div>
            <label
              htmlFor="doc-category"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Kategori
            </label>
            <select
              id="doc-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as DocCategory)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="doc-desc"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Keterangan (opsional)
            </label>
            <textarea
              id="doc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              placeholder="Catatan singkat"
            />
          </div>
          {!editing && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                File
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
              />
              <p className="mt-1 text-xs text-slate-400">
                PDF, Word, Excel, atau gambar · max 25MB
              </p>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Menyimpan..." : editing ? "Simpan" : "Upload"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-brand text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      )}
    >
      {label}
    </button>
  );
}

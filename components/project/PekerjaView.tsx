"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Network,
  Users,
  Phone,
  Mail,
  Pencil,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

export interface WorkerRow {
  id: string;
  name: string;
  position: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  parentId?: string | null;
  active: boolean;
  joinedAt?: string | Date | null;
  createdAt?: string | Date;
}

const POSITIONS = [
  "PM",
  "PMO",
  "Site Manager",
  "Team Leader",
  "Worker",
  "HSE",
  "Engineer/Support",
];

interface PekerjaViewProps {
  projectId: string;
  workers: WorkerRow[];
  canManage: boolean;
}

type TreeNode = WorkerRow & { children: TreeNode[] };

function buildTree(workers: WorkerRow[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const w of workers) {
    map.set(w.id, { ...w, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const w of workers) {
    const node = map.get(w.id)!;
    if (w.parentId && map.has(w.parentId)) {
      map.get(w.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function toDateInput(v?: string | Date | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function PekerjaView({
  projectId,
  workers: initial,
  canManage,
}: PekerjaViewProps) {
  const [workers, setWorkers] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkerRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [position, setPosition] = useState(POSITIONS[0]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [parentId, setParentId] = useState("");
  const [joinedAt, setJoinedAt] = useState("");
  const [active, setActive] = useState(true);

  const tree = useMemo(() => buildTree(workers), [workers]);
  const byId = useMemo(
    () => Object.fromEntries(workers.map((w) => [w.id, w])),
    [workers]
  );
  const selected = selectedId ? byId[selectedId] : null;

  function openCreate() {
    setEditing(null);
    setName("");
    setPosition(POSITIONS[0]);
    setPhone("");
    setEmail("");
    setNotes("");
    setParentId("");
    setJoinedAt("");
    setActive(true);
    setError("");
    setFormOpen(true);
  }

  function openEdit(w: WorkerRow) {
    setEditing(w);
    setName(w.name);
    setPosition(POSITIONS.includes(w.position) ? w.position : POSITIONS[0]);
    setPhone(w.phone || "");
    setEmail(w.email || "");
    setNotes(w.notes || "");
    setParentId(w.parentId || "");
    setJoinedAt(toDateInput(w.joinedAt));
    setActive(w.active);
    setError("");
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const payload = {
      name,
      position,
      phone,
      email,
      notes,
      parentId: parentId || null,
      joinedAt: joinedAt || null,
      active,
    };
    try {
      const res = await fetch(
        editing
          ? `/api/project/${projectId}/worker/${editing.id}`
          : `/api/project/${projectId}/worker`,
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");
      setWorkers((prev) =>
        editing
          ? prev.map((w) => (w.id === editing.id ? { ...w, ...data } : w))
          : [...prev, data]
      );
      setFormOpen(false);
      setSelectedId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(w: WorkerRow) {
    if (!confirm(`Hapus ${w.name}?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/project/${projectId}/worker/${w.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal hapus");
      setWorkers((prev) =>
        prev
          .filter((x) => x.id !== w.id)
          .map((x) =>
            x.parentId === w.id ? { ...x, parentId: null } : x
          )
      );
      if (selectedId === w.id) setSelectedId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const parentOptions = workers.filter((w) => w.id !== editing?.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Data Pekerja
          </h1>
          <p className="text-sm text-slate-500">
            Struktur organisasi & daftar pekerja project
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="mr-1.5 h-4 w-4" />
            Tambah Pekerja
          </Button>
        )}
      </div>

      {/* Org chart */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <Network className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">
            Struktur Organisasi
          </h2>
        </div>
        <div className="overflow-x-auto p-4 sm:p-6">
          {workers.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              Belum ada pekerja. Tambah pekerja untuk membentuk struktur.
            </p>
          ) : (
            <div className="flex min-w-max justify-center">
              <OrgForest
                roots={tree}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>
          )}
        </div>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <Users className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">
            Daftar Pekerja
          </h2>
          <span className="text-xs text-slate-400">({workers.length})</span>
        </div>
        {workers.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            Belum ada data pekerja
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {workers.map((w) => {
              const boss = w.parentId ? byId[w.parentId] : null;
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(w.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50",
                      selectedId === w.id && "bg-slate-50"
                    )}
                  >
                    <Avatar name={w.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">
                        {w.name}
                        {!w.active && (
                          <span className="ml-2 text-xs font-normal text-slate-400">
                            (nonaktif)
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {w.position}
                        {boss ? ` · di bawah ${boss.name}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title="Detail Pekerja"
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Avatar name={selected.name} large />
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  {selected.name}
                </p>
                <p className="text-sm text-slate-500">{selected.position}</p>
                <span
                  className={cn(
                    "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                    selected.active
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  )}
                >
                  {selected.active ? "Aktif" : "Nonaktif"}
                </span>
              </div>
            </div>

            <dl className="space-y-2.5 border-t border-slate-100 pt-4 text-sm">
              <DetailRow
                label="Atasan"
                value={
                  selected.parentId
                    ? byId[selected.parentId]?.name || "—"
                    : "—"
                }
              />
              <DetailRow
                label="Telepon"
                value={selected.phone || "—"}
                icon={Phone}
              />
              <DetailRow
                label="Email"
                value={selected.email || "—"}
                icon={Mail}
              />
              <DetailRow
                label="Bergabung"
                value={
                  selected.joinedAt
                    ? new Date(selected.joinedAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "—"
                }
              />
              <DetailRow label="Catatan" value={selected.notes || "—"} />
            </dl>

            {canManage && (
              <div className="flex gap-2 border-t border-slate-100 pt-4">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setSelectedId(null);
                    openEdit(selected);
                  }}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  disabled={loading}
                  onClick={() => handleDelete(selected)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Hapus
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create / edit form */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit Pekerja" : "Tambah Pekerja"}
      >
        <form onSubmit={handleSave} className="space-y-3">
          <Input
            id="worker-name"
            label="Nama"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <div>
            <label
              htmlFor="worker-position"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Jabatan
            </label>
            <select
              id="worker-position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="worker-parent"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Atasan (opsional)
            </label>
            <select
              id="worker-parent"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            >
              <option value="">— Tidak ada / root —</option>
              {parentOptions.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.position})
                </option>
              ))}
            </select>
          </div>
          <Input
            id="worker-phone"
            label="Telepon"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Opsional"
          />
          <Input
            id="worker-email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Opsional"
          />
          <Input
            id="worker-joined"
            label="Tanggal bergabung"
            type="date"
            value={joinedAt}
            onChange={(e) => setJoinedAt(e.target.value)}
          />
          <Input
            id="worker-notes"
            label="Catatan"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opsional"
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded border-slate-300"
            />
            Aktif
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFormOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "..." : "Simpan"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Avatar({ name, large }: { name: string; large?: boolean }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-slate-900 font-medium text-white",
        large ? "h-12 w-12 text-sm" : "h-9 w-9 text-xs"
      )}
    >
      {initials || "?"}
    </div>
  );
}

function DetailRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex gap-2">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
      <div className={cn(!Icon && "pl-0")}>
        <dt className="text-xs text-slate-400">{label}</dt>
        <dd className="text-slate-800">{value}</dd>
      </div>
    </div>
  );
}

function OrgForest({
  roots,
  selectedId,
  onSelect,
}: {
  roots: TreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (roots.length === 1) {
    return (
      <OrgNode node={roots[0]} selectedId={selectedId} onSelect={onSelect} />
    );
  }
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
      {roots.map((r) => (
        <OrgNode
          key={r.id}
          node={r}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function OrgNode({
  node,
  selectedId,
  onSelect,
}: {
  node: TreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const selected = selectedId === node.id;
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={cn(
          "min-w-[140px] max-w-[180px] rounded-xl border px-3 py-2.5 text-center shadow-sm transition-colors",
          selected
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-200 bg-white text-slate-900 hover:border-slate-400",
          !node.active && !selected && "opacity-60"
        )}
      >
        <p className="truncate text-sm font-semibold">{node.name}</p>
        <p
          className={cn(
            "mt-0.5 truncate text-[10px]",
            selected ? "text-slate-300" : "text-slate-500"
          )}
        >
          {node.position}
        </p>
      </button>

      {node.children.length > 0 && (
        <>
          <div className="h-4 w-px bg-slate-300" />
          <div className="relative flex gap-4 pt-0">
            {node.children.length > 1 && (
              <div
                className="absolute left-0 right-0 top-0 h-px bg-slate-300"
                style={{
                  left: "calc(50% / " + node.children.length + ")",
                  right: "calc(50% / " + node.children.length + ")",
                }}
              />
            )}
            {node.children.map((child) => (
              <div key={child.id} className="flex flex-col items-center">
                <div className="h-4 w-px bg-slate-300" />
                <OrgNode
                  node={child}
                  selectedId={selectedId}
                  onSelect={onSelect}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

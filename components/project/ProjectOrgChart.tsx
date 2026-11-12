"use client";

import { useMemo, useState } from "react";
import { Network, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

export interface OrgPersonRow {
  id: string;
  name: string;
  position: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  parentId?: string | null;
  active: boolean;
}

const POSITIONS = [
  "PM",
  "PMO",
  "Site Manager",
  "Team Leader",
  "Worker",
  "HSE",
  "Engineer/Support",
  "Client",
  "Lainnya",
];

type TreeNode = OrgPersonRow & { children: TreeNode[] };

function buildTree(people: OrgPersonRow[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const p of people) {
    map.set(p.id, { ...p, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const p of people) {
    const node = map.get(p.id)!;
    if (p.parentId && map.has(p.parentId)) {
      map.get(p.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

interface ProjectOrgChartProps {
  projectId: string;
  initial: OrgPersonRow[];
  canManage: boolean;
}

export function ProjectOrgChart({
  projectId,
  initial,
  canManage,
}: ProjectOrgChartProps) {
  const [people, setPeople] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OrgPersonRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [position, setPosition] = useState(POSITIONS[0]);
  const [customPosition, setCustomPosition] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [parentId, setParentId] = useState("");
  const [active, setActive] = useState(true);

  const tree = useMemo(() => buildTree(people), [people]);
  const byId = useMemo(
    () => Object.fromEntries(people.map((p) => [p.id, p])),
    [people]
  );
  const selected = selectedId ? byId[selectedId] : null;

  function openCreate(underId?: string) {
    setEditing(null);
    setName("");
    setPosition(POSITIONS[0]);
    setCustomPosition("");
    setPhone("");
    setEmail("");
    setNotes("");
    setParentId(underId || "");
    setActive(true);
    setError("");
    setFormOpen(true);
  }

  function openEdit(p: OrgPersonRow) {
    setEditing(p);
    setName(p.name);
    if (POSITIONS.includes(p.position)) {
      setPosition(p.position);
      setCustomPosition("");
    } else {
      setPosition("Lainnya");
      setCustomPosition(p.position);
    }
    setPhone(p.phone || "");
    setEmail(p.email || "");
    setNotes(p.notes || "");
    setParentId(p.parentId || "");
    setActive(p.active);
    setError("");
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const pos =
      position === "Lainnya" ? customPosition.trim() || "Lainnya" : position;
    const payload = {
      name,
      position: pos,
      phone,
      email,
      notes,
      parentId: parentId || null,
      active,
    };
    try {
      const res = await fetch(
        editing
          ? `/api/project/${projectId}/org/${editing.id}`
          : `/api/project/${projectId}/org`,
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");
      setPeople((prev) =>
        editing
          ? prev.map((p) => (p.id === editing.id ? { ...p, ...data } : p))
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

  async function handleDelete(p: OrgPersonRow) {
    if (!confirm(`Hapus ${p.name} dari struktur?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/project/${projectId}/org/${p.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal hapus");
      setPeople((prev) =>
        prev
          .filter((x) => x.id !== p.id)
          .map((x) => (x.parentId === p.id ? { ...x, parentId: null } : x))
      );
      if (selectedId === p.id) setSelectedId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const parentOptions = people.filter((p) => p.id !== editing?.id);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Network className="h-4 w-4 text-slate-500" />
            Struktur Organisasi
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Bagan project — terpisah dari Data Pekerja (biodata lapangan)
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => openCreate()} className="shrink-0">
            <Plus className="mr-1 h-3.5 w-3.5" />
            Tambah posisi
          </Button>
        )}
      </div>

      <div className="overflow-x-auto p-4 sm:p-6">
        {people.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Belum ada struktur.{" "}
            {canManage
              ? "Tambah posisi untuk membentuk bagan organisasi."
              : ""}
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

      {selected && (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-slate-900">{selected.name}</p>
              <p className="text-xs text-slate-500">{selected.position}</p>
              {(selected.phone || selected.email) && (
                <p className="mt-1 text-xs text-slate-500">
                  {[selected.phone, selected.email].filter(Boolean).join(" · ")}
                </p>
              )}
              {selected.parentId && byId[selected.parentId] && (
                <p className="mt-1 text-xs text-slate-400">
                  Di bawah: {byId[selected.parentId].name}
                </p>
              )}
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openCreate(selected.id)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Bawahan
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openEdit(selected)}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={loading}
                  onClick={() => handleDelete(selected)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Hapus
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit posisi" : "Tambah posisi"}
      >
        <form onSubmit={handleSave} className="space-y-3">
          <Input
            id="org-name"
            label="Nama"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <div>
            <label
              htmlFor="org-position"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Jabatan
            </label>
            <select
              id="org-position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          {position === "Lainnya" && (
            <Input
              id="org-position-custom"
              label="Jabatan (custom)"
              value={customPosition}
              onChange={(e) => setCustomPosition(e.target.value)}
              required
            />
          )}
          <div>
            <label
              htmlFor="org-parent"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Atasan (opsional)
            </label>
            <select
              id="org-parent"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">— Root / tidak ada —</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.position})
                </option>
              ))}
            </select>
          </div>
          <Input
            id="org-phone"
            label="Telepon"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Opsional"
          />
          <Input
            id="org-email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Opsional"
          />
          <Input
            id="org-notes"
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
            ? "border-brand bg-brand text-white"
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
                  left: `calc(50% / ${node.children.length})`,
                  right: `calc(50% / ${node.children.length})`,
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

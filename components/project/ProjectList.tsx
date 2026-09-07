"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ProjectCard } from "./ProjectCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

interface Project {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  progress: number;
  floorCount?: number;
}

interface ProjectListProps {
  projects: Project[];
  canCreate: boolean;
}

export function ProjectList({ projects: initial, canCreate }: ProjectListProps) {
  const [projects, setProjects] = useState(initial);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat project");
      setProjects((prev) => [
        { ...data, progress: 0, floorCount: 0 },
        ...prev,
      ]);
      setOpen(false);
      setName("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Projects
          </h1>
          <p className="text-sm text-slate-500">Kelola semua project aktif</p>
        </div>
        {canCreate && (
          <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
            <Plus className="mr-1.5 h-4 w-4" />
            Buat Project
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-300">
          <p className="text-sm text-slate-500">Belum ada project</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} {...p} />
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Buat Project Baru">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            id="name"
            label="Nama Project"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Gedung A Tower 1"
          />
          <Input
            id="description"
            label="Deskripsi"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Opsional"
          />
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
              {loading ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

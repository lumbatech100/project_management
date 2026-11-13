"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Users,
  Phone,
  Mail,
  Pencil,
  Trash2,
  Link2,
  Check,
  FolderPlus,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import {
  DEFAULT_WORKER_POSITION,
  WORKER_POSITIONS,
  isWorkerPosition,
} from "@/lib/worker-positions";
import { BLOOD_TYPES } from "@/lib/blood-types";

export interface WorkerGroupRow {
  id: string;
  name: string;
  kind: "INTERNAL" | "SUBCON" | "CUSTOM";
  sortOrder: number;
  inviteToken?: string | null;
  inviteEnabled?: boolean;
  leaders?: StaffUser[];
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role?: string;
}

export interface WorkerRow {
  id: string;
  name: string;
  position: string;
  phone?: string | null;
  email?: string | null;
  nik?: string | null;
  address?: string | null;
  birthDate?: string | Date | null;
  gender?: string | null;
  bloodType?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  photoKtpUrl?: string | null;
  photoSelfieUrl?: string | null;
  notes?: string | null;
  groupId?: string | null;
  userId?: string | null;
  parentId?: string | null;
  active: boolean;
  joinedAt?: string | Date | null;
  inviteToken?: string | null;
  inviteStatus?: "MANUAL" | "PENDING" | "FILLED";
  filledAt?: string | Date | null;
  group?: { id: string; name: string; kind: string } | null;
}

interface PekerjaViewProps {
  projectId: string;
  workers: WorkerRow[];
  groups: WorkerGroupRow[];
  staffUsers: StaffUser[];
  canManage: boolean;
}

function toDateInput(v?: string | Date | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function kindLabel(kind: string) {
  if (kind === "INTERNAL") return "Internal";
  return "Grup worker";
}

function statusLabel(w: WorkerRow) {
  if (w.inviteStatus === "PENDING") return "Menunggu isi data";
  if (w.inviteStatus === "FILLED") return "Sudah isi (link)";
  return "Manual";
}

function statusClass(w: WorkerRow) {
  if (w.inviteStatus === "PENDING") return "bg-amber-50 text-amber-800";
  if (w.inviteStatus === "FILLED") return "bg-emerald-50 text-emerald-800";
  return "bg-slate-100 text-slate-600";
}

function mediaUrl(url?: string | null) {
  if (!url) return null;
  if (url.startsWith("/uploads/")) return `/api/uploads/${url.slice("/uploads/".length)}`;
  return url;
}

export function PekerjaView({
  projectId,
  workers: initialWorkers,
  groups: initialGroups,
  staffUsers,
  canManage,
}: PekerjaViewProps) {
  const [workers, setWorkers] = useState(initialWorkers);
  const [groups, setGroups] = useState(initialGroups);
  const [activeGroupId, setActiveGroupId] = useState<string | "all">(
    initialGroups[0]?.id || "all"
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkerRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedGroupId, setCopiedGroupId] = useState<string | null>(null);
  const [linkMsg, setLinkMsg] = useState("");
  const [activityFilter, setActivityFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  const [name, setName] = useState("");
  const [position, setPosition] = useState<string>(DEFAULT_WORKER_POSITION);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nik, setNik] = useState("");
  const [address, setAddress] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [bloodType, setBloodType] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [groupId, setGroupId] = useState("");
  const [userId, setUserId] = useState("");
  const [joinedAt, setJoinedAt] = useState("");
  const [active, setActive] = useState(true);

  const [newGroupName, setNewGroupName] = useState("");
  const [leaderGroup, setLeaderGroup] = useState<WorkerGroupRow | null>(null);
  const [leaderIds, setLeaderIds] = useState<string[]>([]);

  const formGroupIsInternal =
    groups.find((g) => g.id === groupId)?.kind === "INTERNAL";
  const linkedUserIds = useMemo(
    () =>
      new Set(
        workers
          .filter((w) => w.userId && w.id !== editing?.id)
          .map((w) => w.userId as string)
      ),
    [workers, editing]
  );

  const byId = useMemo(
    () => Object.fromEntries(workers.map((w) => [w.id, w])),
    [workers]
  );
  const selected = selectedId ? byId[selectedId] : null;
  const activeGroup =
    activeGroupId !== "all"
      ? groups.find((g) => g.id === activeGroupId) || null
      : null;

  const filtered = useMemo(() => {
    let list =
      activeGroupId === "all"
        ? workers
        : workers.filter((w) => w.groupId === activeGroupId);
    if (activityFilter === "active") list = list.filter((w) => w.active);
    if (activityFilter === "inactive") list = list.filter((w) => !w.active);
    return list;
  }, [workers, activeGroupId, activityFilter]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: workers.length };
    for (const g of groups) m[g.id] = 0;
    for (const w of workers) {
      if (w.groupId && m[w.groupId] !== undefined) m[w.groupId] += 1;
    }
    return m;
  }, [workers, groups]);

  function openCreate() {
    setEditing(null);
    setName("");
    setPosition(DEFAULT_WORKER_POSITION);
    setPhone("");
    setEmail("");
    setNik("");
    setAddress("");
    setBirthDate("");
    setGender("");
    setBloodType("");
    setEmergencyName("");
    setEmergencyPhone("");
    setNotes("");
    setGroupId(
      activeGroupId !== "all" ? activeGroupId : groups[0]?.id || ""
    );
    setUserId("");
    setJoinedAt("");
    setActive(true);
    setError("");
    setFormOpen(true);
  }

  function openEdit(w: WorkerRow) {
    setEditing(w);
    setName(w.name === "Belum diisi" ? "" : w.name);
    setPosition(
      isWorkerPosition(w.position) ? w.position : DEFAULT_WORKER_POSITION
    );
    setPhone(w.phone || "");
    setEmail(w.email || "");
    setNik(w.nik || "");
    setAddress(w.address || "");
    setBirthDate(toDateInput(w.birthDate));
    setGender(w.gender || "");
    setBloodType(w.bloodType || "");
    setEmergencyName(w.emergencyName || "");
    setEmergencyPhone(w.emergencyPhone || "");
    setNotes(w.notes || "");
    setGroupId(w.groupId || "");
    setUserId(w.userId || "");
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
      nik,
      address,
      birthDate: birthDate || null,
      gender,
      bloodType: bloodType || null,
      emergencyName,
      emergencyPhone,
      notes,
      groupId: groupId || null,
      ...(formGroupIsInternal ? { userId: userId || null } : {}),
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

  async function openDetail(w: WorkerRow) {
    setSelectedId(w.id);
    try {
      const res = await fetch(`/api/project/${projectId}/worker/${w.id}`);
      if (!res.ok) return;
      const data = await res.json();
      setWorkers((prev) =>
        prev.map((x) => (x.id === w.id ? { ...x, ...data } : x))
      );
    } catch {
      // list data tetap dipakai
    }
  }

  async function toggleActive(w: WorkerRow) {
    setLoading(true);
    try {
      const res = await fetch(`/api/project/${projectId}/worker/${w.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: w.name,
          position: w.position,
          groupId: w.groupId ?? null,
          phone: w.phone ?? null,
          email: w.email ?? null,
          nik: w.nik ?? null,
          address: w.address ?? null,
          birthDate: toDateInput(w.birthDate) || null,
          gender: w.gender ?? null,
          bloodType: w.bloodType ?? null,
          emergencyName: w.emergencyName ?? null,
          emergencyPhone: w.emergencyPhone ?? null,
          notes: w.notes ?? null,
          joinedAt: toDateInput(w.joinedAt) || null,
          active: !w.active,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal ubah status");
      setWorkers((prev) =>
        prev.map((x) => (x.id === w.id ? { ...x, ...data } : x))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
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
      setWorkers((prev) => prev.filter((x) => x.id !== w.id));
      if (selectedId === w.id) setSelectedId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function copyGroupInvite(g: WorkerGroupRow) {
    setLoading(true);
    try {
      let token = g.inviteToken;
      const enabled = g.inviteEnabled !== false;
      if (!token || !enabled) {
        const res = await fetch(
          `/api/project/${projectId}/worker-group/${g.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: g.name,
              inviteEnabled: true,
              ...(token ? {} : { rotateInvite: true }),
            }),
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal aktifkan link");
        token = data.inviteToken;
        setGroups((prev) =>
          prev.map((x) => (x.id === g.id ? { ...x, ...data } : x))
        );
      }
      const url = `${window.location.origin}/isi-data/grup/${token}`;
      await navigator.clipboard.writeText(url);
      setCopiedGroupId(g.id);
      setLinkMsg(
        `Link undangan "${g.name}" disalin — kirim sekali, banyak orang bisa isi sendiri (termasuk jabatan)`
      );
      setTimeout(() => {
        setCopiedGroupId(null);
        setLinkMsg("");
      }, 5000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function rotateGroupInvite(g: WorkerGroupRow) {
    if (
      !confirm(
        `Buat link baru untuk "${g.name}"? Link lama tidak bisa dipakai lagi.`
      )
    )
      return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/project/${projectId}/worker-group/${g.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: g.name,
            rotateInvite: true,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      setGroups((prev) =>
        prev.map((x) => (x.id === g.id ? { ...x, ...data } : x))
      );
      const url = `${window.location.origin}${data.invitePath}`;
      await navigator.clipboard.writeText(url);
      setLinkMsg("Link baru dibuat & disalin");
      setTimeout(() => setLinkMsg(""), 4000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function toggleGroupInvite(g: WorkerGroupRow) {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/project/${projectId}/worker-group/${g.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: g.name,
            inviteEnabled: g.inviteEnabled === false,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      setGroups((prev) =>
        prev.map((x) => (x.id === g.id ? { ...x, ...data } : x))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/project/${projectId}/worker-group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal buat grup");
      setGroups((prev) => [...prev, data]);
      setActiveGroupId(data.id);
      setGroupFormOpen(false);
      setNewGroupName("");
      if (data.invitePath) {
        const url = `${window.location.origin}${data.invitePath}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        setLinkMsg(`Grup dibuat — link undangan disalin`);
        setTimeout(() => setLinkMsg(""), 4000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  function openLeaders(g: WorkerGroupRow) {
    setLeaderGroup(g);
    setLeaderIds((g.leaders || []).map((u) => u.id));
    setError("");
  }

  async function saveLeaders(e: React.FormEvent) {
    e.preventDefault();
    if (!leaderGroup) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/project/${projectId}/worker-group/${leaderGroup.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: leaderGroup.name,
            leaderUserIds: leaderIds,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan Leader");
      setGroups((prev) =>
        prev.map((x) => (x.id === leaderGroup.id ? { ...x, ...data } : x))
      );
      setLeaderGroup(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteGroup(g: WorkerGroupRow) {
    if (g.kind === "INTERNAL") {
      alert("Grup Internal tidak bisa dihapus");
      return;
    }
    if (!confirm(`Hapus grup "${g.name}"? Pekerja tetap ada tanpa grup.`))
      return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/project/${projectId}/worker-group/${g.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal hapus");
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
      setWorkers((prev) =>
        prev.map((w) =>
          w.groupId === g.id ? { ...w, groupId: null, group: null } : w
        )
      );
      if (activeGroupId === g.id) setActiveGroupId("all");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Data Pekerja
          </h1>
          <p className="text-sm text-slate-500">
            Satu link per grup — orang isi sendiri nama, jabatan, dan biodata
          </p>
        </div>
        {canManage && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              onClick={() => {
                setError("");
                setGroupFormOpen(true);
              }}
              className="w-full sm:w-auto"
            >
              <FolderPlus className="mr-1.5 h-4 w-4" />
              Buat grup
            </Button>
            <Button onClick={openCreate} className="w-full sm:w-auto">
              <Plus className="mr-1.5 h-4 w-4" />
              Tambah manual
            </Button>
          </div>
        )}
      </div>

      {linkMsg && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {linkMsg}
        </p>
      )}

      {/* Group tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActiveGroupId("all")}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
            activeGroupId === "all"
              ? "border-brand bg-brand text-white"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
          )}
        >
          Semua ({counts.all || 0})
        </button>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setActiveGroupId(g.id)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              activeGroupId === g.id
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
            )}
          >
            {g.name}
            <span
              className={cn(
                "ml-1.5 text-xs",
                activeGroupId === g.id ? "text-slate-300" : "text-slate-400"
              )}
            >
              ({counts[g.id] || 0})
            </span>
          </button>
        ))}
      </div>

      {/* Active group invite */}
      {activeGroup && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Link undangan · {activeGroup.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Salin sekali, kirim ke grup WA — tiap orang isi sendiri
                (nama + jabatan + biodata). Link bisa dipakai berulang.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  {kindLabel(activeGroup.kind)}
                </span>
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 font-medium",
                    activeGroup.inviteEnabled === false
                      ? "bg-slate-100 text-slate-500"
                      : "bg-emerald-50 text-emerald-700"
                  )}
                >
                  {activeGroup.inviteEnabled === false
                    ? "Link nonaktif"
                    : "Link aktif"}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {activeGroup.kind === "INTERNAL" ? (
                  "Absen: tiap orang absen sendiri lewat akun login yang ditautkan (Edit pekerja → Akun login)."
                ) : (
                  <>
                    Leader pengabsen:{" "}
                    <span className="font-medium text-slate-700">
                      {activeGroup.leaders?.length
                        ? activeGroup.leaders.map((u) => u.name).join(", ")
                        : "belum diatur"}
                    </span>
                  </>
                )}
              </p>
            </div>
            {canManage && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="sm"
                  disabled={loading}
                  onClick={() => copyGroupInvite(activeGroup)}
                >
                  {copiedGroupId === activeGroup.id ? (
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <Link2 className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Salin link undangan
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={loading}
                  onClick={() => toggleGroupInvite(activeGroup)}
                >
                  {activeGroup.inviteEnabled === false
                    ? "Aktifkan"
                    : "Nonaktifkan"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={loading}
                  onClick={() => rotateGroupInvite(activeGroup)}
                >
                  Ganti link
                </Button>
                {activeGroup.kind !== "INTERNAL" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={loading}
                    onClick={() => openLeaders(activeGroup)}
                  >
                    Atur Leader
                  </Button>
                )}
                {activeGroup.kind !== "INTERNAL" && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={loading}
                    onClick={() => handleDeleteGroup(activeGroup)}
                  >
                    Hapus grup
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeGroupId === "all" && canManage && (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Pilih tab grup (Internal / Grup A / …) lalu{" "}
          <span className="font-medium text-slate-700">
            Salin link undangan
          </span>{" "}
          — satu link untuk semua orang di grup itu.
        </p>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">
              Daftar pekerja
            </h2>
            <span className="text-xs text-slate-400">({filtered.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["all", "Semua"],
                ["active", "Aktif"],
                ["inactive", "Nonaktif"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActivityFilter(key)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium",
                  activityFilter === key
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            Belum ada pekerja di grup ini.
            {canManage &&
              " Salin link undangan grup, atau tambah manual."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Nama</th>
                  <th className="px-4 py-2.5 font-medium">Jabatan</th>
                  <th className="px-4 py-2.5 font-medium">Grup</th>
                  <th className="px-4 py-2.5 font-medium">HP</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  {canManage && (
                    <th className="px-4 py-2.5 font-medium text-right">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => {
                  const g =
                    w.group ||
                    groups.find((x) => x.id === w.groupId) ||
                    null;
                  const selfie = mediaUrl(w.photoSelfieUrl);
                  return (
                    <tr
                      key={w.id}
                      onClick={() => openDetail(w)}
                      className={cn(
                        "cursor-pointer border-t border-slate-50 hover:bg-slate-50/80",
                        !w.active && "opacity-70"
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          {selfie ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={selfie}
                              alt=""
                              className="h-9 w-9 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                              {w.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-slate-900">
                              {w.name}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              Ketuk untuk lihat detail
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {w.position}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {g?.name || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {w.phone || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "inline-block rounded-md px-1.5 py-0.5 text-xs font-medium",
                            w.active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          )}
                        >
                          {w.active ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      {canManage && (
                        <td
                          className="px-4 py-2.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              title="Edit"
                              onClick={() => openEdit(w)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Hapus"
                              disabled={loading}
                              onClick={() => handleDelete(w)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail */}
      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title="Detail Pekerja"
        className="sm:max-w-xl"
      >
        {selected && (
          <div className="space-y-4">
            <div>
              <p className="text-lg font-semibold text-slate-900">
                {selected.name}
              </p>
              <p className="text-sm text-slate-500">{selected.position}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    selected.active
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  )}
                >
                  {selected.active ? "Aktif" : "Nonaktif"}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    statusClass(selected)
                  )}
                >
                  {statusLabel(selected)}
                </span>
              </div>
            </div>
            <dl className="space-y-2.5 border-t border-slate-100 pt-4 text-sm">
              <DetailRow
                label="Grup"
                value={
                  selected.group?.name ||
                  groups.find((g) => g.id === selected.groupId)?.name ||
                  "—"
                }
              />
              {selected.userId && (
                <DetailRow
                  label="Akun login (absen)"
                  value={
                    staffUsers.find((u) => u.id === selected.userId)?.email ||
                    "Tertaut"
                  }
                />
              )}
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
              <DetailRow label="NIK" value={selected.nik || "—"} />
              <DetailRow label="Alamat" value={selected.address || "—"} />
              <DetailRow
                label="JK"
                value={
                  selected.gender === "L"
                    ? "Laki-laki"
                    : selected.gender === "P"
                      ? "Perempuan"
                      : "—"
                }
              />
              <DetailRow
                label="Gol. darah"
                value={selected.bloodType || "—"}
              />
              <DetailRow
                label="Tgl lahir"
                value={
                  selected.birthDate
                    ? new Date(selected.birthDate).toLocaleDateString("id-ID")
                    : "—"
                }
              />
              <DetailRow
                label="Kontak darurat"
                value={
                  selected.emergencyName || selected.emergencyPhone
                    ? `${selected.emergencyName || "—"} · ${selected.emergencyPhone || "—"}`
                    : "—"
                }
              />
              <DetailRow label="Catatan" value={selected.notes || "—"} />
            </dl>

            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
              <PhotoSlot
                label="Foto diri"
                url={mediaUrl(selected.photoSelfieUrl)}
              />
              <PhotoSlot
                label="Foto KTP"
                url={mediaUrl(selected.photoKtpUrl)}
              />
            </div>

            {canManage && (
              <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                <Button
                  variant={selected.active ? "secondary" : "primary"}
                  className="flex-1"
                  disabled={loading}
                  onClick={() => toggleActive(selected)}
                >
                  {selected.active ? "Nonaktifkan" : "Aktifkan"}
                </Button>
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

      {/* Worker form */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit Pekerja" : "Tambah Pekerja"}
      >
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label
              htmlFor="worker-group"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Grup
            </label>
            <select
              id="worker-group"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">— Pilih grup —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({kindLabel(g.kind)})
                </option>
              ))}
            </select>
          </div>
          {formGroupIsInternal && (
            <div>
              <label
                htmlFor="worker-user"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Akun login (absen sendiri)
              </label>
              <select
                id="worker-user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              >
                <option value="">— Tidak ditautkan —</option>
                {staffUsers
                  .filter(
                    (u) => u.role !== "ADMIN" && u.role !== "PM" && u.role !== "SM"
                  )
                  .map((u) => (
                  <option
                    key={u.id}
                    value={u.id}
                    disabled={linkedUserIds.has(u.id)}
                  >
                    {u.name} ({u.email})
                    {linkedUserIds.has(u.id) ? " — sudah dipakai" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Hanya member project. Tambah member di Project Details bila
                akun belum muncul.
              </p>
            </div>
          )}
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
              value={
                isWorkerPosition(position)
                  ? position
                  : DEFAULT_WORKER_POSITION
              }
              onChange={(e) => setPosition(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              {WORKER_POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <Input
            id="worker-phone"
            label="Telepon"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            id="worker-nik"
            label="NIK"
            value={nik}
            onChange={(e) => setNik(e.target.value)}
          />
          <Input
            id="worker-email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            id="worker-address"
            label="Alamat"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <div>
            <label
              htmlFor="worker-gender"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Jenis kelamin
            </label>
            <select
              id="worker-gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">—</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="worker-blood"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Golongan darah
            </label>
            <select
              id="worker-blood"
              value={bloodType}
              onChange={(e) => setBloodType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">—</option>
              {BLOOD_TYPES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <Input
            id="worker-birth"
            label="Tanggal lahir"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
          <Input
            id="worker-em-name"
            label="Kontak darurat (nama)"
            value={emergencyName}
            onChange={(e) => setEmergencyName(e.target.value)}
          />
          <Input
            id="worker-em-phone"
            label="Kontak darurat (HP)"
            value={emergencyPhone}
            onChange={(e) => setEmergencyPhone(e.target.value)}
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

      {/* New group */}
      <Modal
        open={groupFormOpen}
        onClose={() => setGroupFormOpen(false)}
        title="Buat grup"
      >
        <form onSubmit={handleCreateGroup} className="space-y-3">
          <Input
            id="group-name"
            label="Nama grup"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            required
            placeholder="mis. Grup A"
          />
          <p className="text-xs text-slate-500">
            Grup worker diabsen oleh Leader-nya. Atur Leader setelah grup
            dibuat.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setGroupFormOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "..." : "Simpan"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Group leaders */}
      <Modal
        open={!!leaderGroup}
        onClose={() => setLeaderGroup(null)}
        title={`Leader · ${leaderGroup?.name ?? ""}`}
      >
        <form onSubmit={saveLeaders} className="space-y-3">
          <p className="text-sm text-slate-500">
            Leader yang dicentang bisa mengabsen anggota grup ini setiap hari.
          </p>
          {staffUsers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              Belum ada member project. Tambah member di Project Details dulu.
            </p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {staffUsers.map((u) => (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={leaderIds.includes(u.id)}
                    onChange={(e) =>
                      setLeaderIds((prev) =>
                        e.target.checked
                          ? [...prev, u.id]
                          : prev.filter((id) => id !== u.id)
                      )
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-slate-800">{u.name}</span>
                  <span className="text-xs text-slate-400">
                    {u.role ? `${u.role} · ` : ""}
                    {u.email}
                  </span>
                </label>
              ))}
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setLeaderGroup(null)}
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

function PhotoSlot({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <p className="bg-slate-50 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="h-44 w-full object-cover" />
        </a>
      ) : (
        <div className="flex h-44 items-center justify-center bg-slate-50 px-3 text-center text-xs text-slate-400">
          Belum ada foto
        </div>
      )}
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
      <div>
        <dt className="text-xs text-slate-400">{label}</dt>
        <dd className="text-slate-800">{value}</dd>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Copy,
  MailPlus,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  defaultMenusForRole,
  hasMenu,
  menusGrouped,
  type MenuGroup,
} from "@/lib/menus";
import { canManageUsers } from "@/lib/utils";
import type { Role } from "@prisma/client";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  menus: string[];
  createdAt: string;
}

interface InviteRow {
  id: string;
  name: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  invitePath: string;
  projects: { id: string; name: string }[];
}

const ROLES = ["ADMIN", "PM", "SM", "LEADER", "CLIENT"] as const;

const emptyInviteForm = { name: "", email: "", projectIds: [] as string[] };

function inviteUrl(path: string) {
  return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
}

function whatsappShareUrl(invite: Pick<InviteRow, "name" | "invitePath">) {
  const text =
    `Halo ${invite.name}, Anda diundang ke Simplo PMS untuk memantau progress project.\n\n` +
    `Silakan buat password akun Anda lewat link berikut (berlaku 7 hari):\n${inviteUrl(invite.invitePath)}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "LEADER" as string,
  menus: defaultMenusForRole("LEADER") as string[],
};

export default function UserPage() {
  const { data: session, status, update: refreshSession } = useSession();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState(emptyInviteForm);
  const [inviteResult, setInviteResult] = useState<InviteRow | null>(null);
  const [inviteMsg, setInviteMsg] = useState("");

  const canManage = canManageUsers(
    session?.user?.role as Role,
    session?.user?.menus
  );
  const currentUserId = session?.user?.id;
  const groups = menusGrouped();

  useEffect(() => {
    if (!canManage) return;
    fetch("/api/user")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Gagal memuat user");
        }
        return res.json();
      })
      .then(setUsers)
      .catch((e) => setError(e.message));
    fetch("/api/user/invite")
      .then((res) => (res.ok ? res.json() : []))
      .then(setInvites)
      .catch(() => {});
    fetch("/api/project")
      .then((res) => (res.ok ? res.json() : []))
      .then((list: { id: string; name: string }[]) =>
        setProjects(list.map((p) => ({ id: p.id, name: p.name })))
      )
      .catch(() => {});
  }, [canManage]);

  if (status === "loading") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Memuat...
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="font-medium text-slate-700">Akses ditolak</p>
        <p className="mt-1 text-sm text-slate-500">
          Anda tidak punya privilege menu User Management
          {!hasMenu(session?.user?.menus, "main.user")
            ? " (centang menu User Management di hak akses)."
            : "."}
        </p>
      </div>
    );
  }

  function openCreate() {
    setForm({
      ...emptyForm,
      menus: defaultMenusForRole("LEADER"),
    });
    setError("");
    setCreateOpen(true);
  }

  function openEdit(u: UserRow) {
    setEditTarget(u);
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      menus: u.menus?.length
        ? u.menus
        : defaultMenusForRole(u.role as Role),
    });
    setError("");
  }

  function toggleMenu(key: string) {
    setForm((prev) => {
      const has = prev.menus.includes(key);
      return {
        ...prev,
        menus: has
          ? prev.menus.filter((m) => m !== key)
          : [...prev.menus, key],
      };
    });
  }

  function applyRoleDefaults(role: string) {
    setForm((prev) => ({
      ...prev,
      role,
      menus: defaultMenusForRole(role as Role),
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      setUsers((prev) => [data, ...prev]);
      setCreateOpen(false);
      setForm(emptyForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setLoading(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        role: form.role,
        menus: form.menus,
      };
      if (form.password) payload.password = form.password;

      const res = await fetch(`/api/user/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal update");
      setUsers((prev) => prev.map((u) => (u.id === editTarget.id ? data : u)));
      if (editTarget.id === currentUserId) {
        await refreshSession();
      }
      setEditTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  function flashInviteMsg(msg: string) {
    setInviteMsg(msg);
    setTimeout(() => setInviteMsg(""), 4000);
  }

  function openInvite() {
    setInviteForm(emptyInviteForm);
    setInviteResult(null);
    setError("");
    setInviteOpen(true);
  }

  function toggleInviteProject(id: string) {
    setInviteForm((prev) => ({
      ...prev,
      projectIds: prev.projectIds.includes(id)
        ? prev.projectIds.filter((p) => p !== id)
        : [...prev.projectIds, id],
    }));
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (inviteForm.projectIds.length === 0) {
      setError("Pilih minimal 1 project");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/user/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat undangan");
      setInvites((prev) => [data, ...prev.filter((i) => i.id !== data.id)]);
      setInviteResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function copyInviteLink(invite: InviteRow) {
    try {
      await navigator.clipboard.writeText(inviteUrl(invite.invitePath));
      flashInviteMsg(`Link undangan ${invite.name} disalin`);
    } catch {
      window.prompt("Salin link undangan:", inviteUrl(invite.invitePath));
    }
  }

  async function renewInvite(invite: InviteRow) {
    setError("");
    try {
      const res = await fetch(`/api/user/invite/${invite.id}`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat link baru");
      const updated = { ...invite, ...data };
      setInvites((prev) => prev.map((i) => (i.id === invite.id ? updated : i)));
      await copyInviteLink(updated);
      flashInviteMsg(`Link baru untuk ${invite.name} dibuat & disalin (link lama tidak berlaku)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function revokeInvite(invite: InviteRow) {
    if (!window.confirm(`Batalkan undangan untuk ${invite.email}?`)) return;
    setError("");
    try {
      const res = await fetch(`/api/user/invite/${invite.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal membatalkan undangan");
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
      flashInviteMsg("Undangan dibatalkan");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/user/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal hapus");
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
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
            User Management
          </h1>
          <p className="text-sm text-slate-500">
            Kelola akun, role, dan privilege menu
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            onClick={openInvite}
            className="w-full sm:w-auto"
          >
            <MailPlus className="mr-1.5 h-4 w-4" />
            Undang Client
          </Button>
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="mr-1.5 h-4 w-4" />
            Tambah User
          </Button>
        </div>
      </div>

      {error && !createOpen && !editTarget && !deleteTarget && !inviteOpen && (
        <p className="mb-4 text-sm text-red-600">{error}</p>
      )}
      {inviteMsg && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {inviteMsg}
        </p>
      )}

      {invites.length > 0 && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">
              Menunggu aktivasi ({invites.length})
            </p>
            <p className="text-xs text-slate-500">
              Client belum membuat password dari link undangan
            </p>
          </div>
          <ul className="divide-y divide-slate-100">
            {invites.map((inv) => {
              const expired = new Date(inv.expiresAt).getTime() < Date.now();
              return (
                <li
                  key={inv.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-slate-900">
                      {inv.name}{" "}
                      <span className="font-normal text-slate-500">
                        · {inv.email}
                      </span>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {inv.projects.map((p) => p.name).join(", ") || "—"} ·{" "}
                      {expired ? (
                        <span className="font-medium text-red-600">
                          Kedaluwarsa
                        </span>
                      ) : (
                        <>
                          Berlaku s/d{" "}
                          {new Date(inv.expiresAt).toLocaleDateString("id-ID")}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!expired && (
                      <>
                        <button
                          type="button"
                          title="Salin link"
                          onClick={() => copyInviteLink(inv)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <a
                          href={whatsappShareUrl(inv)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Kirim via WhatsApp"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      </>
                    )}
                    <button
                      type="button"
                      title="Buat link baru (7 hari)"
                      onClick={() => renewInvite(inv)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Batalkan undangan"
                      onClick={() => revokeInvite(inv)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nama</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Menu</th>
              <th className="px-4 py-3 font-medium">Dibuat</th>
              <th className="px-4 py-3 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {u.name}
                </td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {u.menus?.length ?? 0} menu
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(u.createdAt).toLocaleDateString("id-ID")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      title="Edit"
                      onClick={() => openEdit(u)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="Hapus"
                      disabled={u.id === currentUserId}
                      onClick={() => {
                        setError("");
                        setDeleteTarget(u);
                      }}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Belum ada user
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tambah User"
        className="sm:max-w-lg"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <UserFormFields
            form={form}
            setForm={setForm}
            groups={groups}
            passwordRequired
            onRoleChange={applyRoleDefaults}
            onToggleMenu={toggleMenu}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              Simpan
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Update User"
        className="sm:max-w-lg"
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          <UserFormFields
            form={form}
            setForm={setForm}
            groups={groups}
            passwordRequired={false}
            passwordHint="Kosongkan jika tidak diganti"
            onRoleChange={applyRoleDefaults}
            onToggleMenu={toggleMenu}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditTarget(null)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "..." : "Update"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={inviteResult ? "Undangan siap dikirim" : "Undang Client"}
        className="sm:max-w-lg"
      >
        {inviteResult ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Kirim link ini ke{" "}
              <span className="font-semibold text-slate-900">
                {inviteResult.name}
              </span>
              . Client membuat password sendiri, lalu login dengan email{" "}
              <span className="font-medium text-slate-900">
                {inviteResult.email}
              </span>
              . Link berlaku 7 hari dan hanya bisa dipakai sekali.
            </p>
            <div className="break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
              {inviteUrl(inviteResult.invitePath)}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => copyInviteLink(inviteResult)}
              >
                <Copy className="mr-1.5 h-4 w-4" />
                Salin link
              </Button>
              <a
                href={whatsappShareUrl(inviteResult)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button type="button" className="w-full">
                  <MessageCircle className="mr-1.5 h-4 w-4" />
                  Kirim via WhatsApp
                </Button>
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="space-y-4">
            <p className="text-sm text-slate-500">
              Client akan menerima link untuk membuat password sendiri. Admin
              tidak perlu (dan tidak bisa) tahu password client.
            </p>
            <Input
              id="inv-name"
              label="Nama client"
              value={inviteForm.name}
              onChange={(e) =>
                setInviteForm({ ...inviteForm, name: e.target.value })
              }
              required
            />
            <Input
              id="inv-email"
              label="Email client (untuk login)"
              type="email"
              value={inviteForm.email}
              onChange={(e) =>
                setInviteForm({ ...inviteForm, email: e.target.value })
              }
              required
            />
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-slate-700">
                Project yang bisa dilihat
              </p>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {projects.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={inviteForm.projectIds.includes(p.id)}
                      onChange={() => toggleInviteProject(p.id)}
                      className="rounded border-slate-300"
                    />
                    {p.name}
                  </label>
                ))}
                {projects.length === 0 && (
                  <p className="px-2 py-1.5 text-sm text-slate-400">
                    Belum ada project
                  </p>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Role CLIENT: Dashboard + progress (view-only). Bisa diubah
                setelah akun aktif.
              </p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setInviteOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Membuat..." : "Buat link undangan"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Hapus User"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Hapus akun{" "}
            <span className="font-semibold text-slate-900">
              {deleteTarget?.name}
            </span>{" "}
            ({deleteTarget?.email})?
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
            >
              Batal
            </Button>
            <Button variant="danger" disabled={loading} onClick={handleDelete}>
              {loading ? "..." : "Hapus"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function UserFormFields({
  form,
  setForm,
  groups,
  passwordRequired,
  passwordHint,
  onRoleChange,
  onToggleMenu,
}: {
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  groups: MenuGroup[];
  passwordRequired: boolean;
  passwordHint?: string;
  onRoleChange: (role: string) => void;
  onToggleMenu: (key: string) => void;
}) {
  return (
    <>
      <Input
        id="uname"
        label="Nama"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
      />
      <Input
        id="uemail"
        label="Email"
        type="email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        required
      />
      <Input
        id="upass"
        label="Password"
        type="password"
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
        required={passwordRequired}
        placeholder={passwordHint}
      />
      {passwordHint && (
        <p className="-mt-2 text-xs text-slate-400">{passwordHint}</p>
      )}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700">Role</label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          value={form.role}
          onChange={(e) => onRoleChange(e.target.value)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400">
          Ganti role mengisi default menu; centang di bawah bisa dikustom
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 p-3">
        <p className="text-sm font-medium text-slate-800">Privilege menu</p>
        {groups.map((section) => {
          const keys = section.items.map((item) => item.key);
          const selectedCount = keys.filter((k) =>
            form.menus.includes(k)
          ).length;
          const allOn = selectedCount === keys.length;
          const someOn = selectedCount > 0 && !allOn;
          const standalone =
            section.items.length === 1 &&
            section.items[0]!.label === section.group;

          function toggleGroup() {
            setForm((prev) => {
              const next = new Set(prev.menus);
              if (allOn) keys.forEach((k) => next.delete(k));
              else keys.forEach((k) => next.add(k));
              return { ...prev, menus: Array.from(next) };
            });
          }

          if (standalone) {
            const item = section.items[0]!;
            return (
              <label
                key={section.group}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={form.menus.includes(item.key)}
                  onChange={() => onToggleMenu(item.key)}
                  className="rounded border-slate-300"
                />
                {section.group}
              </label>
            );
          }

          return (
            <div key={section.group}>
              <label className="mb-1 flex cursor-pointer items-center gap-2 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(el) => {
                    if (el) el.indeterminate = someOn;
                  }}
                  onChange={toggleGroup}
                  className="rounded border-slate-300"
                />
                {section.group}
              </label>
              <div className="ml-5 grid gap-1 sm:grid-cols-2">
                {section.items.map((item) => (
                  <label
                    key={item.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={form.menus.includes(item.key)}
                      onChange={() => onToggleMenu(item.key)}
                      className="rounded border-slate-300"
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

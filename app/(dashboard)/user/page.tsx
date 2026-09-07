"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  defaultMenusForRole,
  menusGrouped,
  type MenuKey,
} from "@/lib/menus";
import type { Role } from "@prisma/client";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  menus: string[];
  createdAt: string;
}

const ROLES = ["ADMIN", "PM", "SM", "LEADER"] as const;

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "LEADER" as string,
  menus: defaultMenusForRole("LEADER") as string[],
};

export default function UserPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const isAdmin = session?.user?.role === "ADMIN";
  const currentUserId = session?.user?.id;
  const groups = menusGrouped();

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/user")
      .then(async (res) => {
        if (!res.ok) throw new Error("Gagal memuat user");
        return res.json();
      })
      .then(setUsers)
      .catch((e) => setError(e.message));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="font-medium text-slate-700">Akses ditolak</p>
        <p className="mt-1 text-sm text-slate-500">
          Hanya Admin yang dapat mengelola user
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
      setEditTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
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
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="mr-1.5 h-4 w-4" />
          Tambah User
        </Button>
      </div>

      {error && !createOpen && !editTarget && !deleteTarget && (
        <p className="mb-4 text-sm text-red-600">{error}</p>
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
  groups: Record<string, { key: MenuKey; label: string }[]>;
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
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
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
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {group}
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {items.map((item) => (
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
        ))}
      </div>
    </>
  );
}

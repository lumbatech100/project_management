"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Calendar,
  HardDrive,
  Layers,
  MapPin,
  ListChecks,
  FileText,
  ImageIcon,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { formatBytes } from "@/lib/format";

export type MailSettings = {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassSet: boolean;
  mailFrom: string;
  mailFromName: string;
  mailTo: string[];
  mailCc: string[];
};

interface ProjectDetailsProps {
  project: {
    id: string;
    name: string;
    description?: string | null;
    status: string;
    createdAt: string | Date;
    timelinePdfUrl?: string | null;
  };
  stats: {
    floors: number;
    markers: number;
    items: number;
    drawings: number;
    hasTimelinePdf: boolean;
    storageBytes: number;
    drawingBytes: number;
    timelineBytes: number;
  };
  mailSettings: MailSettings;
  canManage: boolean;
}

export function ProjectDetailsView({
  project: initial,
  stats,
  mailSettings: initialMail,
  canManage,
}: ProjectDetailsProps) {
  const router = useRouter();
  const [project, setProject] = useState(initial);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description || "");
  const [status, setStatus] = useState(initial.status);
  const [confirmName, setConfirmName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [mail, setMail] = useState(initialMail);
  const [smtpHost, setSmtpHost] = useState(initialMail.smtpHost);
  const [smtpPort, setSmtpPort] = useState(String(initialMail.smtpPort || 587));
  const [smtpSecure, setSmtpSecure] = useState(initialMail.smtpSecure);
  const [smtpUser, setSmtpUser] = useState(initialMail.smtpUser);
  const [smtpPass, setSmtpPass] = useState("");
  const [mailFrom, setMailFrom] = useState(initialMail.mailFrom);
  const [mailFromName, setMailFromName] = useState(initialMail.mailFromName);
  const [mailTo, setMailTo] = useState(initialMail.mailTo.join(", "));
  const [mailCc, setMailCc] = useState(initialMail.mailCc.join(", "));
  const [mailLoading, setMailLoading] = useState(false);
  const [mailError, setMailError] = useState("");
  const [mailOk, setMailOk] = useState("");

  const createdLabel = new Date(project.createdAt).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  function openEdit() {
    setName(project.name);
    setDescription(project.description || "");
    setStatus(project.status);
    setError("");
    setEditOpen(true);
  }

  function openDelete() {
    setConfirmName("");
    setPassword("");
    setError("");
    setDeleteOpen(true);
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/project/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal update");
      setProject((p) => ({
        ...p,
        name: data.name,
        description: data.description,
        status: data.status,
      }));
      setEditOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/project/${project.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal hapus");
      window.location.assign("/project");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setLoading(false);
    }
  }

  async function handleSaveMail(e: React.FormEvent) {
    e.preventDefault();
    setMailLoading(true);
    setMailError("");
    setMailOk("");
    try {
      const res = await fetch(`/api/project/${project.id}/mail-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpHost,
          smtpPort,
          smtpSecure,
          smtpUser,
          smtpPass,
          mailFrom,
          mailFromName,
          mailTo,
          mailCc,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan email");
      setMail(data);
      setSmtpPass("");
      setMailTo((data.mailTo || []).join(", "));
      setMailCc((data.mailCc || []).join(", "));
      setMailOk("Pengaturan email tersimpan.");
      router.refresh();
    } catch (err) {
      setMailError(err instanceof Error ? err.message : "Error");
    } finally {
      setMailLoading(false);
    }
  }

  const nameMatches = confirmName.trim() === project.name;
  const canSubmitDelete = nameMatches && password.length > 0;
  const mailConfigured =
    !!mail.smtpHost && !!mail.mailFrom && mail.mailTo.length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          Project Details
        </h1>
        <p className="text-sm text-slate-500">
          Informasi dan pengaturan project
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {project.name}
            </h2>
            {project.description ? (
              <p className="mt-1 text-sm text-slate-500">
                {project.description}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-400">Tidak ada deskripsi</p>
            )}
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              project.status === "active"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {project.status}
          </span>
        </div>

        <dl className="mt-5 space-y-3 border-t border-slate-100 pt-5">
          <Row icon={Calendar} label="Dibuat" value={createdLabel} />
          <Row
            icon={HardDrive}
            label="Storage terpakai"
            value={formatBytes(stats.storageBytes)}
            hint={
              stats.storageBytes > 0
                ? `Drawing ${formatBytes(stats.drawingBytes)} · PDF timeline ${formatBytes(stats.timelineBytes)}`
                : undefined
            }
          />
          <Row icon={Layers} label="Lantai" value={String(stats.floors)} />
          <Row icon={MapPin} label="Marker" value={String(stats.markers)} />
          <Row
            icon={ListChecks}
            label="Breakdown item"
            value={String(stats.items)}
          />
          <Row
            icon={ImageIcon}
            label="Drawing terupload"
            value={`${stats.drawings} file`}
          />
          <Row
            icon={FileText}
            label="PDF timeline"
            value={stats.hasTimelinePdf ? "Ada" : "Belum ada"}
          />
          <Row
            icon={Mail}
            label="Email laporan"
            value={mailConfigured ? "Terkonfigurasi" : "Belum dikonfigurasi"}
            hint={
              mailConfigured
                ? `Ke: ${mail.mailTo.join(", ")}`
                : "Isi SMTP di bawah (Admin/PM)"
            }
          />
        </dl>
      </div>

      {canManage && (
        <form
          onSubmit={handleSaveMail}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
        >
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Mail className="h-4 w-4 text-slate-500" />
              Pengaturan Email (SMTP)
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Digunakan untuk mengirim laporan harian otomatis setelah cutoff /
              close.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="smtp-host"
              label="SMTP Host"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.gmail.com"
            />
            <Input
              id="smtp-port"
              label="Port"
              type="number"
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
              placeholder="587"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={smtpSecure}
              onChange={(e) => setSmtpSecure(e.target.checked)}
              className="rounded border-slate-300"
            />
            Secure (SSL/TLS — biasanya port 465)
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="smtp-user"
              label="SMTP Username"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              placeholder="user@domain.com"
              autoComplete="off"
            />
            <Input
              id="smtp-pass"
              label={
                mail.smtpPassSet
                  ? "SMTP Password (kosongkan = tetap)"
                  : "SMTP Password"
              }
              type="password"
              value={smtpPass}
              onChange={(e) => setSmtpPass(e.target.value)}
              placeholder={mail.smtpPassSet ? "••••••••" : ""}
              autoComplete="new-password"
            />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              Pengirim
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                id="mail-from"
                label="Email pengirim (From)"
                type="email"
                value={mailFrom}
                onChange={(e) => setMailFrom(e.target.value)}
                placeholder="noreply@perusahaan.com"
              />
              <Input
                id="mail-from-name"
                label="Nama pengirim"
                value={mailFromName}
                onChange={(e) => setMailFromName(e.target.value)}
                placeholder="Simplo PMS"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              Penerima
            </p>
            <div>
              <label
                htmlFor="mail-to"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                To (pisahkan koma / baris baru)
              </label>
              <textarea
                id="mail-to"
                value={mailTo}
                onChange={(e) => setMailTo(e.target.value)}
                rows={2}
                placeholder="pm@perusahaan.com, sm@perusahaan.com"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div className="mt-3">
              <label
                htmlFor="mail-cc"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                CC (opsional)
              </label>
              <textarea
                id="mail-cc"
                value={mailCc}
                onChange={(e) => setMailCc(e.target.value)}
                rows={2}
                placeholder="admin@perusahaan.com"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>

          {mailError && <p className="text-sm text-red-600">{mailError}</p>}
          {mailOk && <p className="text-sm text-emerald-600">{mailOk}</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={mailLoading}>
              {mailLoading ? "Menyimpan..." : "Simpan pengaturan email"}
            </Button>
          </div>
        </form>
      )}

      {canManage && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">Kelola project</h3>
          <p className="mt-1 text-xs text-slate-500">
            Update data project atau hapus secara permanen
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button onClick={openEdit} className="sm:flex-1">
              Update
            </Button>
            <Button
              variant="danger"
              onClick={openDelete}
              className="sm:flex-1"
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Update Project"
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          <Input
            id="details-name"
            label="Nama Project"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            id="details-description"
            label="Deskripsi"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Opsional"
          />
          <div>
            <label
              htmlFor="details-status"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Status
            </label>
            <select
              id="details-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            >
              <option value="active">active</option>
              <option value="completed">completed</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Hapus Project"
      >
        <form onSubmit={handleDelete} className="space-y-4">
          <p className="text-sm text-slate-600">
            Hapus permanen project beserta lantai, drawing, marker, dan data
            terkait. Ketik nama{" "}
            <span className="font-semibold text-slate-900">{project.name}</span>{" "}
            lalu password akun Anda.
          </p>
          <Input
            id="details-confirm-name"
            label="Nama project"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={project.name}
            required
            autoComplete="off"
          />
          <Input
            id="details-password"
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {confirmName && !nameMatches && (
            <p className="text-sm text-amber-600">Nama project belum cocok</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={loading || !canSubmitDelete}
            >
              {loading ? "Menghapus..." : "Hapus Project"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-lg bg-slate-50 p-2 text-slate-500">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="text-sm font-medium text-slate-900">{value}</dd>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}

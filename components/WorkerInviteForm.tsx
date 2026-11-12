"use client";

import { FormEvent, useEffect, useState } from "react";
import { HardHat, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { WorkerPhotoField } from "@/components/WorkerPhotoField";
import {
  DEFAULT_WORKER_POSITION,
  WORKER_POSITIONS,
  isWorkerPosition,
} from "@/lib/worker-positions";
import { BLOOD_TYPES, isBloodType } from "@/lib/blood-types";

interface InviteData {
  projectName: string;
  groupName: string | null;
  name: string;
  position: string;
  phone: string | null;
  email: string | null;
  nik: string | null;
  address: string | null;
  birthDate: string | null;
  gender: string | null;
  bloodType: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  hasPhotoKtp?: boolean;
  hasPhotoSelfie?: boolean;
  alreadyFilled: boolean;
}

function toDateInput(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function WorkerInviteForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [meta, setMeta] = useState<{
    projectName: string;
    groupName: string | null;
  } | null>(null);

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
  const [photoKtp, setPhotoKtp] = useState<File | null>(null);
  const [photoSelfie, setPhotoSelfie] = useState<File | null>(null);
  const [existingKtp, setExistingKtp] = useState(false);
  const [existingSelfie, setExistingSelfie] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/worker-invite/${token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Link tidak valid");
        if (cancelled) return;
        const d = data as InviteData;
        setMeta({
          projectName: d.projectName,
          groupName: d.groupName,
        });
        if (d.alreadyFilled) {
          setDone(true);
          return;
        }
        setName(d.name === "Belum diisi" ? "" : d.name || "");
        setPosition(
          isWorkerPosition(d.position) ? d.position : DEFAULT_WORKER_POSITION
        );
        setPhone(d.phone || "");
        setEmail(d.email || "");
        setNik(d.nik || "");
        setAddress(d.address || "");
        setBirthDate(toDateInput(d.birthDate));
        setGender(d.gender || "");
        setBloodType(isBloodType(d.bloodType || "") ? d.bloodType! : "");
        setEmergencyName(d.emergencyName || "");
        setEmergencyPhone(d.emergencyPhone || "");
        setExistingKtp(!!d.hasPhotoKtp);
        setExistingSelfie(!!d.hasPhotoSelfie);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Gagal memuat");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!phone.trim()) {
      setError("Nomor HP wajib");
      return;
    }
    if (!bloodType) {
      setError("Golongan darah wajib dipilih");
      return;
    }
    if (!emergencyName.trim() || !emergencyPhone.trim()) {
      setError("Kontak darurat (nama & nomor HP) wajib");
      return;
    }
    if (!photoKtp && !existingKtp) {
      setError("Foto KTP wajib");
      return;
    }
    if (!photoSelfie && !existingSelfie) {
      setError("Foto diri wajib");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const form = new FormData();
      form.set("name", name);
      form.set("position", position);
      form.set("phone", phone);
      form.set("email", email);
      form.set("nik", nik);
      form.set("address", address);
      form.set("birthDate", birthDate);
      form.set("gender", gender);
      form.set("bloodType", bloodType);
      form.set("emergencyName", emergencyName);
      form.set("emergencyPhone", emergencyPhone);
      if (photoKtp) form.set("photoKtp", photoKtp);
      if (photoSelfie) form.set("photoSelfie", photoSelfie);

      const res = await fetch(`/api/worker-invite/${token}`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal kirim");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="py-16 text-center text-sm text-slate-500">Memuat form…</p>
    );
  }

  if (error && !meta) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-white p-6 text-center">
        <p className="text-sm font-medium text-red-700">{error}</p>
        <p className="mt-2 text-xs text-slate-500">
          Minta link baru ke admin / PM project.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h1 className="mt-4 text-lg font-semibold text-slate-900">
          Data tersimpan
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Terima kasih. Data diri Anda sudah masuk ke project{" "}
          <span className="font-medium text-slate-700">
            {meta?.projectName}
          </span>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white">
          <HardHat className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Isi Data Diri</h1>
        <p className="mt-1 text-sm text-slate-500">
          {meta?.projectName}
          {meta?.groupName ? ` · ${meta.groupName}` : ""}
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Wajib: nomor HP, golongan darah, kontak darurat, foto KTP & foto diri
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <Input
          id="inv-name"
          label="Nama lengkap"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          id="inv-phone"
          label="Nomor HP"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          placeholder="08…"
        />
        <Input
          id="inv-nik"
          label="NIK / KTP"
          value={nik}
          onChange={(e) => setNik(e.target.value)}
          placeholder="Opsional"
        />
        <div>
          <label
            htmlFor="inv-position"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Jabatan / posisi
          </label>
          <select
            id="inv-position"
            value={
              isWorkerPosition(position) ? position : DEFAULT_WORKER_POSITION
            }
            onChange={(e) => setPosition(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          >
            {WORKER_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Foto wajib
          </p>
          <WorkerPhotoField
            id="inv-photo-ktp"
            label="Foto KTP"
            hint="Ambil foto KTP yang jelas, tidak blur"
            kind="ktp"
            file={photoKtp}
            onChange={(f) => {
              setPhotoKtp(f);
              setExistingKtp(false);
            }}
            required
            hasExisting={existingKtp}
          />
          <WorkerPhotoField
            id="inv-photo-selfie"
            label="Foto diri"
            hint="Foto wajah jelas, menghadap kamera"
            kind="selfie"
            file={photoSelfie}
            onChange={(f) => {
              setPhotoSelfie(f);
              setExistingSelfie(false);
            }}
            required
            hasExisting={existingSelfie}
          />
        </div>

        <div>
          <label
            htmlFor="inv-gender"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Jenis kelamin
          </label>
          <select
            id="inv-gender"
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
            htmlFor="inv-blood"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Golongan darah <span className="text-red-500">*</span>
          </label>
          <select
            id="inv-blood"
            value={bloodType}
            onChange={(e) => setBloodType(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          >
            <option value="">— Pilih golongan darah —</option>
            {BLOOD_TYPES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <Input
          id="inv-birth"
          label="Tanggal lahir"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
        <Input
          id="inv-email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Opsional"
        />
        <Input
          id="inv-address"
          label="Alamat"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Opsional"
        />
        <div className="border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Kontak darurat (wajib)
          </p>
          <div className="space-y-3">
            <Input
              id="inv-em-name"
              label="Nama"
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              required
              placeholder="Nama keluarga / kerabat"
            />
            <Input
              id="inv-em-phone"
              label="Nomor HP"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              required
              placeholder="08…"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Menyimpan…" : "Kirim data"}
        </Button>
      </form>
    </div>
  );
}

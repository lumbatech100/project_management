"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Logo } from "@/components/ui/Logo";

const MIN_PASSWORD_LENGTH = 8;

type InviteInfo = {
  name: string;
  email: string;
  expiresAt: string;
  projects: string[];
};

export default function UndanganPage(
  props: {
    params: Promise<{ token: string }>;
  }
) {
  const params = use(props.params);
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/invite/${encodeURIComponent(params.token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setAlreadyAccepted(!!data.accepted);
          throw new Error(data.error || "Link undangan tidak valid");
        }
        setInfo(data);
        setName(data.name);
      })
      .catch((e) => setLoadError(e.message));
  }, [params.token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!info) return;
    setError("");
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password minimal ${MIN_PASSWORD_LENGTH} karakter`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Konfirmasi password tidak sama");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/invite/${encodeURIComponent(params.token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, password, confirmPassword }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal membuat akun");

      const login = await signIn("credentials", {
        email: info.email,
        password,
        redirect: false,
      });
      // Full reload supaya cookie session pasti terbaca middleware
      window.location.assign(login?.ok ? "/project" : "/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat akun");
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="mb-6 text-center">
        <h1>
          <Logo priority className="mx-auto h-12" />
          <span className="sr-only">Simplo PMS</span>
        </h1>
        <p className="mt-3 text-sm text-slate-500">Aktivasi akun client</p>
      </div>

      {!info && !loadError && (
        <p className="text-center text-sm text-slate-500">Memuat undangan...</p>
      )}

      {loadError && (
        <div className="space-y-4 text-center">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {loadError}
          </p>
          {alreadyAccepted && (
            <Link href="/login">
              <Button className="w-full">Ke halaman login</Button>
            </Link>
          )}
        </div>
      )}

      {info && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Anda diundang untuk memantau progress project:
            <ul className="mt-1 list-inside list-disc font-medium text-slate-900">
              {info.projects.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <Input
            id="invite-email"
            label="Email (untuk login)"
            type="email"
            value={info.email}
            readOnly
            disabled
          />
          <Input
            id="invite-name"
            label="Nama"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
          <Input
            id="invite-password"
            label="Buat password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD_LENGTH}
            placeholder={`Minimal ${MIN_PASSWORD_LENGTH} karakter`}
            autoComplete="new-password"
          />
          <Input
            id="invite-password-confirm"
            label="Ulangi password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Membuat akun..." : "Aktifkan akun"}
          </Button>
          <p className="text-center text-xs text-slate-400">
            Link berlaku sampai{" "}
            {new Date(info.expiresAt).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </form>
      )}
    </div>
  );
}

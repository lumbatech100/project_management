"use client";

import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Logo } from "@/components/ui/Logo";

function homePathForMenus(menus: string[] | undefined) {
  if (menus?.includes("main.dashboard")) return "/dashboard";
  if (menus?.includes("main.project")) return "/project";
  if (menus?.includes("main.setting")) return "/setting";
  return "/project";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (!res || res.error || res.ok === false) {
        setError(
          res?.error?.startsWith("Terlalu banyak")
            ? res.error
            : "Email atau password salah"
        );
        setLoading(false);
        return;
      }

      const session = await getSession();
      const dest = homePathForMenus(session?.user?.menus);
      // Full reload supaya cookie session pasti terbaca middleware
      window.location.assign(dest);
    } catch {
      setError("Gagal terhubung ke server. Coba lagi.");
      setLoading(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="h-1.5 bg-brand" />
      <div className="p-5 sm:p-8">
      <div className="mb-8 text-center">
        <h1>
          <Logo priority className="mx-auto h-12" />
          <span className="sr-only">Simplo PMS</span>
        </h1>
        <p className="mt-3 text-sm font-medium text-slate-600">
          Project Management System
        </p>
        <p className="mt-1 text-sm text-slate-500">Masuk ke akun Anda</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="admin@simplo.id"
          autoComplete="email"
        />
        <Input
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="••••••••"
          autoComplete="current-password"
        />
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Masuk..." : "Masuk"}
        </Button>
      </form>
      </div>
    </div>
  );
}

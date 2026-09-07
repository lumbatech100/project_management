"use client";

import { useSession } from "next-auth/react";

export default function SettingPage() {
  const { data: session } = useSession();

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Setting</h1>
        <p className="text-sm text-slate-500">Profil dan preferensi akun</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <Row label="Nama" value={session?.user?.name || "—"} />
        <Row label="Email" value={session?.user?.email || "—"} />
        <Row label="Role" value={session?.user?.role || "—"} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

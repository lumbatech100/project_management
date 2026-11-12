"use client";

import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Layers, MapPin, ListChecks, TrendingUp } from "lucide-react";

interface FloorRow {
  id: string;
  name: string;
  progress: number;
  markers: number;
  items: number;
  done: number;
}

interface LaggingMarker {
  id: string;
  label: string;
  floorName: string;
  progress: number;
}

interface RecentItem {
  id: string;
  name: string;
  doneAt: Date | string | null;
  doneBy: string | null;
}

interface ProjectSummaryProps {
  projectId: string;
  status: string;
  createdAt: Date | string;
  overall: number;
  totalMarkers: number;
  totalItems: number;
  doneCount: number;
  floorRows: FloorRow[];
  laggingMarkers: LaggingMarker[];
  recentDone: RecentItem[];
}

const COLORS = ["#0f172a", "#334155", "#64748b", "#94a3b8", "#cbd5e1"];

export function ProjectSummary({
  projectId,
  status,
  createdAt,
  overall,
  totalMarkers,
  totalItems,
  doneCount,
  floorRows,
  laggingMarkers,
  recentDone,
}: ProjectSummaryProps) {
  const floorCount = floorRows.length;
  const floorShare =
    floorCount > 0 ? Math.round((100 / floorCount) * 10) / 10 : 0;

  const chartData = floorRows.map((f) => ({
    name: f.name.length > 12 ? f.name.slice(0, 12) + "…" : f.name,
    progress: f.progress,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat
          icon={TrendingUp}
          label="Progress project"
          value={`${overall}%`}
          hint={
            floorCount > 0
              ? `Rata-rata ${floorCount} lantai (≈${floorShare}%/lantai)`
              : status
          }
        />
        <Stat
          icon={Layers}
          label="Lantai"
          value={String(floorCount)}
        />
        <Stat
          icon={MapPin}
          label="Marker"
          value={String(totalMarkers)}
        />
        <Stat
          icon={ListChecks}
          label="Item selesai"
          value={`${doneCount}/${totalItems}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-3">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Progress per Lantai
              </h2>
              <p className="text-xs text-slate-400">
                Tiap lantai 100% · project = rata-rata lantai
              </p>
            </div>
            <Link
              href={`/project/${projectId}/progress`}
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              Buka Progress →
            </Link>
          </div>
          {chartData.length === 0 ? (
            <Empty text="Belum ada lantai" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    tickLine={false}
                    unit="%"
                  />
                  <Tooltip
                    formatter={(value) => [`${value ?? 0}%`, "Progress"]}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="progress" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">
            Ringkasan Lantai
          </h2>
          <p className="mb-3 text-xs text-slate-400">
            Progress lantai = rata-rata progress pintu/marker
          </p>
          {floorRows.length === 0 ? (
            <Empty text="Belum ada lantai" />
          ) : (
            <ul className="space-y-3">
              {floorRows.map((f) => (
                <li key={f.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium text-slate-800">{f.name}</span>
                    <span className="text-slate-500">{f.progress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {f.markers} marker · {f.done}/{f.items} item
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Perlu perhatian
          </h2>
          {laggingMarkers.length === 0 ? (
            <Empty text="Semua marker selesai atau belum ada data" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {laggingMarkers.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {m.label}
                    </p>
                    <p className="text-xs text-slate-400">{m.floorName}</p>
                  </div>
                  <span className="ml-3 shrink-0 text-sm font-semibold text-amber-600">
                    {m.progress}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Progress terbaru
          </h2>
          {recentDone.length === 0 ? (
            <Empty text="Belum ada item yang dicentang" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentDone.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {i.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {i.doneBy || "—"}
                      {i.doneAt
                        ? ` · ${new Date(i.doneAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : ""}
                    </p>
                  </div>
                  <span className="ml-3 shrink-0 text-xs text-emerald-600">
                    Selesai
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Dibuat{" "}
        {new Date(createdAt).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
    </div>
  );
}

function Stat({
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
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-1">
        <p className="text-xs text-slate-500 sm:text-sm">{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-slate-400" />
      </div>
      <p className="text-xl font-bold text-slate-900 sm:text-2xl">{value}</p>
      {hint && (
        <p className="mt-1 line-clamp-2 text-[11px] capitalize text-slate-400 sm:text-xs">
          {hint}
        </p>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-slate-200">
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  );
}

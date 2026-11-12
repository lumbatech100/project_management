"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type Status = "HADIR" | "IZIN" | "SAKIT" | "ALPA";

const STATUSES: Status[] = ["HADIR", "IZIN", "SAKIT", "ALPA"];

const STATUS_META: Record<
  Status,
  { label: string; short: string; on: string; badge: string }
> = {
  HADIR: {
    label: "Hadir",
    short: "H",
    on: "border-emerald-600 bg-emerald-600 text-white",
    badge: "bg-emerald-50 text-emerald-700",
  },
  IZIN: {
    label: "Izin",
    short: "I",
    on: "border-sky-600 bg-sky-600 text-white",
    badge: "bg-sky-50 text-sky-700",
  },
  SAKIT: {
    label: "Sakit",
    short: "S",
    on: "border-amber-500 bg-amber-500 text-white",
    badge: "bg-amber-50 text-amber-700",
  },
  ALPA: {
    label: "Alpa",
    short: "A",
    on: "border-red-600 bg-red-600 text-white",
    badge: "bg-red-50 text-red-700",
  },
};

interface AttendanceRecord {
  status: Status;
  notes: string | null;
  recordedBy: string | null;
  updatedAt: string;
}

interface WorkerRow {
  id: string;
  name: string;
  position: string;
  groupId: string | null;
  active: boolean;
  record: AttendanceRecord | null;
}

interface GroupRow {
  id: string;
  name: string;
  kind: string;
  leaders: { id: string; name: string }[];
  sheet: { photoUrls: string[]; submittedBy: string | null } | null;
  workers: WorkerRow[];
}

interface DayData {
  date: string;
  today: string;
  canManage: boolean;
  self: WorkerRow | null;
  groups: GroupRow[];
  totals: Record<Status | "BELUM", number>;
}

interface SummaryRow {
  id: string;
  name: string;
  position: string;
  groupName: string;
  counts: Record<Status, number>;
}

type Draft = { status: Status | null; notes: string };

function shiftDate(key: string, days: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatLongDate(key: string) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function draftsFrom(data: DayData) {
  const out: Record<string, Draft> = {};
  const rows = [...data.groups.flatMap((g) => g.workers)];
  if (data.self) rows.push(data.self);
  for (const r of rows) {
    out[r.id] = {
      status: r.record?.status ?? null,
      notes: r.record?.notes ?? "",
    };
  }
  return out;
}

function isDirty(row: WorkerRow, d?: Draft) {
  if (!d) return false;
  return (
    (row.record?.status ?? null) !== d.status ||
    (row.record?.notes ?? "") !== d.notes.trim()
  );
}

export function AbsenView({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const [tab, setTab] = useState<"harian" | "rekap">("harian");
  const [date, setDate] = useState<string | null>(null);
  const [data, setData] = useState<DayData | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [photos, setPhotos] = useState<Record<string, File | null>>({});
  /** Admin/PM: grup yang sedang dibuka mode koreksi (default tampil laporan, bukan form absen). */
  const [editing, setEditing] = useState<Record<string, boolean>>({});

  const load = useCallback(
    async (d: string | null) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/project/${projectId}/attendance${d ? `?date=${d}` : ""}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Gagal memuat absen");
        setData(json);
        setDrafts(draftsFrom(json));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    load(date);
  }, [load, date]);

  const isToday = !!data && data.date === data.today;
  const editable = !!data && (isToday || data.canManage);

  function setDraft(workerId: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [workerId]: { ...(prev[workerId] ?? { status: null, notes: "" }), ...patch },
    }));
  }

  async function submitGroup(g: GroupRow) {
    if (!data) return;
    const missing = g.workers.filter(
      (w) => drafts[w.id]?.status !== "HADIR" && !drafts[w.id]?.notes.trim()
    );
    if (!photos[g.id] && !g.sheet?.photoUrls.length) {
      setError("Foto selfie bersama pekerja wajib diambil dulu");
      return;
    }
    if (missing.length) {
      setError(`${missing[0].name} tidak hadir, isi keterangannya`);
      return;
    }
    setSavingKey(g.id);
    setError("");
    try {
      const form = new FormData();
      form.set("date", data.date);
      form.set("groupId", g.id);
      form.set(
        "entries",
        JSON.stringify(
          g.workers.map((w) => ({
            workerId: w.id,
            present: drafts[w.id]?.status === "HADIR",
            notes: drafts[w.id]?.notes.trim() || "",
          }))
        )
      );
      if (photos[g.id]) form.append("photo", photos[g.id]!);
      const res = await fetch(`/api/project/${projectId}/attendance`, {
        method: "PUT",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal submit absen");
      setMsg("Absen terkirim");
      setTimeout(() => setMsg(""), 3000);
      setPhotos((prev) => ({ ...prev, [g.id]: null }));
      setEditing((prev) => ({ ...prev, [g.id]: false }));
      await load(data.date === data.today ? null : data.date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingKey(null);
    }
  }

  async function save(rows: WorkerRow[], key: string) {
    if (!data) return;
    const entries = rows
      .filter((r) => isDirty(r, drafts[r.id]))
      .map((r) => ({
        workerId: r.id,
        status: drafts[r.id].status,
        notes: drafts[r.id].notes.trim() || null,
      }));
    if (entries.length === 0) return;
    setSavingKey(key);
    setError("");
    try {
      const res = await fetch(`/api/project/${projectId}/attendance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: data.date, entries }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal simpan absen");
      setMsg(`${entries.length} absen tersimpan`);
      setTimeout(() => setMsg(""), 3000);
      await load(data.date === data.today ? null : data.date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingKey(null);
    }
  }

  function markAllPresent(g: GroupRow) {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const w of g.workers) {
        next[w.id] = { status: "HADIR", notes: "" };
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Absensi
          </h1>
          <p className="text-sm text-slate-500">
            {canManage
              ? "Laporan & pengelolaan absensi · grup worker diabsen Leader-nya"
              : "Internal absen sendiri · grup worker diabsen Leader-nya"}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-1.5">
            {(
              [
                ["harian", "Harian"],
                ["rekap", "Rekap bulanan"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === k
                    ? "border-brand bg-brand text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "rekap" && canManage ? (
        <MonthlySummary projectId={projectId} defaultMonth={data?.today.slice(0, 7)} />
      ) : (
        <>
          {data && (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-900">
                  {formatLongDate(data.date)}
                </span>
                {isToday && (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    Hari ini
                  </span>
                )}
              </div>
              {(data.canManage ||
                data.groups.some((g) => g.kind !== "INTERNAL")) && (
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={loading}
                    onClick={() => setDate(shiftDate(data.date, -1))}
                    aria-label="Hari sebelumnya"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <input
                    type="date"
                    value={data.date}
                    max={data.today}
                    onChange={(e) =>
                      e.target.value &&
                      setDate(e.target.value === data.today ? null : e.target.value)
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={loading || isToday}
                    onClick={() => {
                      const next = shiftDate(data.date, 1);
                      setDate(next === data.today ? null : next);
                    }}
                    aria-label="Hari berikutnya"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {!isToday && (
                    <Button size="sm" variant="ghost" onClick={() => setDate(null)}>
                      Hari ini
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {data && (
            <div className="flex flex-wrap gap-2 text-xs">
              {STATUSES.map((s) => (
                <span
                  key={s}
                  className={cn("rounded-md px-2 py-1 font-medium", STATUS_META[s].badge)}
                >
                  {STATUS_META[s].label}: {data.totals[s]}
                </span>
              ))}
              <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-600">
                Belum diabsen: {data.totals.BELUM}
              </span>
            </div>
          )}

          {msg && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {msg}
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {loading && !data ? (
            <div className="flex h-32 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-400">
              Memuat…
            </div>
          ) : data ? (
            <>
              {data.self && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-slate-500" />
                    <h2 className="text-sm font-semibold text-slate-900">
                      Absen saya
                    </h2>
                    <span className="text-xs text-slate-400">
                      {data.self.name} · {data.self.position}
                    </span>
                  </div>
                  <AttendanceRow
                    row={data.self}
                    draft={drafts[data.self.id]}
                    disabled={!editable}
                    statuses={["HADIR", "IZIN", "SAKIT"]}
                    hideName
                    onChange={(patch) => setDraft(data.self!.id, patch)}
                  />
                  {editable && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        disabled={
                          savingKey !== null ||
                          !isDirty(data.self, drafts[data.self.id])
                        }
                        onClick={() => save([data.self!], "self")}
                      >
                        {savingKey === "self" ? "..." : "Simpan absen saya"}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {data.groups.length === 0 && !data.self && (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  Belum ada grup yang bisa Anda absen.
                </div>
              )}

              {data.groups.map((g) => {
                const dirtyCount = g.workers.filter((w) =>
                  isDirty(w, drafts[w.id])
                ).length;
                return (
                  <div
                    key={g.id}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-slate-500" />
                          <h2 className="text-sm font-semibold text-slate-900">
                            {g.name}
                          </h2>
                          <span className="text-xs text-slate-400">
                            ({g.workers.length})
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {g.kind === "INTERNAL"
                            ? "Absen sendiri via akun masing-masing"
                            : g.leaders.length
                              ? `Leader: ${g.leaders.map((l) => l.name).join(", ")}`
                              : "Leader belum diatur"}
                        </p>
                      </div>
                      {editable && g.kind === "INTERNAL" && g.workers.length > 0 && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => markAllPresent(g)}
                          >
                            <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                            Sisanya hadir
                          </Button>
                          <Button
                            size="sm"
                            disabled={savingKey !== null || dirtyCount === 0}
                            onClick={() => save(g.workers, g.id)}
                          >
                            {savingKey === g.id
                              ? "..."
                              : `Simpan${dirtyCount ? ` (${dirtyCount})` : ""}`}
                          </Button>
                        </div>
                      )}
                    </div>
                    {g.workers.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-slate-400">
                        Belum ada pekerja aktif di grup ini.
                      </p>
                    ) : g.kind === "INTERNAL" ? (
                      <ul className="divide-y divide-slate-100">
                        {g.workers.map((w) => (
                          <li key={w.id} className="px-4 py-3">
                            <AttendanceRow
                              row={w}
                              draft={drafts[w.id]}
                              disabled={!editable}
                              statuses={STATUSES}
                              onChange={(patch) => setDraft(w.id, patch)}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : data.canManage && !editing[g.id] ? (
                      <GroupReport
                        group={g}
                        onEdit={() =>
                          setEditing((prev) => ({ ...prev, [g.id]: true }))
                        }
                      />
                    ) : (
                      <div className="space-y-3 px-4 py-3">
                        <p className="text-xs text-slate-500">
                          Foto selfie bersama pekerja, centang yang hadir. Yang tidak hadir wajib ada keterangan.
                        </p>
                        <label className="block text-sm font-medium text-slate-700">
                          Foto selfie
                          <input
                            type="file"
                            accept="image/*"
                            capture="user"
                            disabled={!editable}
                            className="mt-1 block w-full text-sm"
                            onChange={(e) =>
                              setPhotos((prev) => ({
                                ...prev,
                                [g.id]: e.target.files?.[0] ?? null,
                              }))
                            }
                          />
                        </label>
                        {g.sheet?.photoUrls[0] && !photos[g.id] && (
                          <a href={g.sheet.photoUrls[0]} target="_blank" rel="noreferrer" className="text-xs font-medium text-slate-700 underline">
                            Lihat foto yang sudah dikirim
                          </a>
                        )}
                        {editable && (
                          <Button size="sm" variant="secondary" onClick={() => markAllPresent(g)}>
                            Centang semua hadir
                          </Button>
                        )}
                        <ul className="divide-y divide-slate-100">
                          {g.workers.map((w) => {
                            const present = drafts[w.id]?.status === "HADIR";
                            return (
                              <li key={w.id} className="py-3">
                                <label className="flex cursor-pointer items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={present}
                                    disabled={!editable}
                                    onChange={(e) =>
                                      setDraft(w.id, {
                                        status: e.target.checked ? "HADIR" : null,
                                        notes: e.target.checked
                                          ? ""
                                          : drafts[w.id]?.notes ?? "",
                                      })
                                    }
                                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600 disabled:cursor-not-allowed"
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-sm font-medium text-slate-900">
                                      {w.name}
                                    </span>
                                    <span className="block text-xs text-slate-400">
                                      {w.position}
                                    </span>
                                  </span>
                                </label>
                                {!present && (
                                  <input
                                    value={drafts[w.id]?.notes ?? ""}
                                    disabled={!editable}
                                    onChange={(e) => setDraft(w.id, { notes: e.target.value })}
                                    placeholder="Keterangan tidak hadir (wajib)"
                                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                                  />
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        {editable && (
                          <div className="flex justify-end gap-2">
                            {data.canManage && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={savingKey !== null}
                                onClick={() => {
                                  setEditing((prev) => ({ ...prev, [g.id]: false }));
                                  setPhotos((prev) => ({ ...prev, [g.id]: null }));
                                  setDrafts(draftsFrom(data));
                                }}
                              >
                                Batal
                              </Button>
                            )}
                            <Button
                              size="sm"
                              disabled={savingKey !== null}
                              onClick={() => submitGroup(g)}
                            >
                              {savingKey === g.id ? "..." : "Submit absen"}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/** Tampilan laporan absen grup untuk Admin/PM: hasil submit Leader, bukan form input. */
function GroupReport({
  group,
  onEdit,
}: {
  group: GroupRow;
  onEdit: () => void;
}) {
  const records = group.workers.filter((w) => w.record);
  const submitted = records.length > 0 || !!group.sheet;
  const photos = group.sheet?.photoUrls ?? [];
  const last = records.reduce<AttendanceRecord | null>(
    (acc, w) =>
      !acc || new Date(w.record!.updatedAt) > new Date(acc.updatedAt)
        ? w.record
        : acc,
    null
  );
  const by = group.sheet?.submittedBy || last?.recordedBy || null;

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={cn(
              "rounded-md px-2 py-1 font-medium",
              submitted
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            )}
          >
            {submitted ? "Sudah disubmit" : "Belum disubmit"}
          </span>
          {submitted && (by || last) && (
            <span className="text-slate-500">
              {by ? `oleh ${by}` : ""}
              {last ? `${by ? " · " : ""}${formatTime(last.updatedAt)} WIB` : ""}
            </span>
          )}
        </div>
        <Button size="sm" variant="secondary" onClick={onEdit}>
          {submitted ? "Koreksi absen" : "Isi absen"}
        </Button>
      </div>

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Foto selfie bersama pekerja"
                className="h-32 w-32 rounded-lg border border-slate-200 object-cover"
              />
            </a>
          ))}
        </div>
      )}

      <ul className="divide-y divide-slate-100">
        {group.workers.map((w) => {
          const st = w.record?.status ?? null;
          return (
            <li
              key={w.id}
              className="flex items-start justify-between gap-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {w.name}
                </p>
                <p className="text-xs text-slate-400">{w.position}</p>
                {w.record?.notes && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {w.record.notes}
                  </p>
                )}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md px-2 py-1 text-xs font-medium",
                  st
                    ? STATUS_META[st].badge
                    : "bg-slate-100 text-slate-500"
                )}
              >
                {st ? STATUS_META[st].label : "Belum"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AttendanceRow({
  row,
  draft,
  disabled,
  statuses,
  hideName,
  onChange,
}: {
  row: WorkerRow;
  draft?: Draft;
  disabled: boolean;
  statuses: Status[];
  hideName?: boolean;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const current = draft?.status ?? null;
  const showNotes = !!current && (current !== "HADIR" || !!draft?.notes);
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {!hideName && (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {row.name}
              {!row.active && (
                <span className="ml-1.5 text-xs font-normal text-slate-400">
                  (nonaktif)
                </span>
              )}
            </p>
            <p className="text-xs text-slate-400">
              {row.position}
              {row.record?.recordedBy
                ? ` · dicatat ${row.record.recordedBy}`
                : ""}
            </p>
          </div>
        )}
        <div className="flex gap-1.5">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ status: current === s ? null : s })}
              title={STATUS_META[s].label}
              className={cn(
                "min-w-[2.5rem] rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                current === s
                  ? STATUS_META[s].on
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              )}
            >
              <span className="sm:hidden">{STATUS_META[s].short}</span>
              <span className="hidden sm:inline">{STATUS_META[s].label}</span>
            </button>
          ))}
        </div>
      </div>
      {showNotes && (
        <input
          type="text"
          value={draft?.notes ?? ""}
          maxLength={300}
          disabled={disabled}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Catatan (mis. alasan izin/sakit)"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:bg-slate-50"
        />
      )}
    </div>
  );
}

function MonthlySummary({
  projectId,
  defaultMonth,
}: {
  projectId: string;
  defaultMonth?: string;
}) {
  const [month, setMonth] = useState(
    defaultMonth || new Date().toISOString().slice(0, 7)
  );
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/project/${projectId}/attendance/summary?month=${month}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Gagal memuat rekap");
        if (!cancelled) setRows(json.workers);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, month]);

  const totals = useMemo(() => {
    const t: Record<Status, number> = { HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0 };
    for (const r of rows) for (const s of STATUSES) t[s] += r.counts[s];
    return t;
  }, [rows]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          Rekap per pekerja
        </h2>
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>
      {error && (
        <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Nama</th>
              <th className="px-4 py-2.5 font-medium">Grup</th>
              {STATUSES.map((s) => (
                <th key={s} className="px-3 py-2.5 text-center font-medium">
                  {STATUS_META[s].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Memuat…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Belum ada data.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-900">{r.name}</p>
                    <p className="text-xs text-slate-400">{r.position}</p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{r.groupName}</td>
                  {STATUSES.map((s) => (
                    <td key={s} className="px-3 py-2.5 text-center tabular-nums text-slate-700">
                      {r.counts[s] || "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot className="bg-slate-50 text-sm font-semibold text-slate-700">
              <tr>
                <td className="px-4 py-2.5" colSpan={2}>
                  Total
                </td>
                {STATUSES.map((s) => (
                  <td key={s} className="px-3 py-2.5 text-center tabular-nums">
                    {totals[s]}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

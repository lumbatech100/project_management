"use client";

import { useMemo, useRef, useState } from "react";
import {
  CalendarRange,
  ChevronDown,
  FileText,
  GanttChart,
  Save,
  Trash2,
  Upload,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SCurveChart } from "@/components/project/timeline/SCurveChart";
import { buildSCurveSeries, type SCurveFloor } from "@/lib/s-curve";
import { calcFloorProgress, calcProjectProgress, cn } from "@/lib/utils";

interface FloorRow {
  id: string;
  name: string;
  plannedStart?: string | Date | null;
  plannedEnd?: string | Date | null;
  markers: {
    items: {
      bobot: number;
      done: boolean;
      progressPct?: number | null;
      status?: string | null;
      approvedAt?: string | Date | null;
      doneAt?: string | Date | null;
      submittedAt?: string | Date | null;
    }[];
  }[];
}

interface TimelineViewProps {
  projectId: string;
  timelinePdfUrl?: string | null;
  floors: FloorRow[];
  canManage: boolean;
}

function toDateInput(value?: string | Date | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date) {
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000));
}

export function TimelineView({
  projectId,
  timelinePdfUrl: initialPdf,
  floors: initial,
  canManage,
}: TimelineViewProps) {
  const [floors, setFloors] = useState(initial);
  const [pdfUrl, setPdfUrl] = useState(initialPdf || null);
  const [drafts, setDrafts] = useState<
    Record<string, { plannedStart: string; plannedEnd: string }>
  >(() =>
    Object.fromEntries(
      initial.map((f) => [
        f.id,
        {
          plannedStart: toDateInput(f.plannedStart),
          plannedEnd: toDateInput(f.plannedEnd),
        },
      ])
    )
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [pdfModal, setPdfModal] = useState<"replace" | "delete" | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pdfPassword, setPdfPassword] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [openFloorIds, setOpenFloorIds] = useState<Set<string>>(new Set());

  function toggleFloor(id: string) {
    setOpenFloorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const projectActual = calcProjectProgress(
    floors.map((f) => ({
      markers: f.markers.map((m) => ({
        items: m.items.map((i) => ({
          bobot: i.bobot,
          done: i.status === "APPROVED" || i.done,
          progressPct: i.progressPct,
        })),
      })),
    }))
  );

  const floorsForCurve: SCurveFloor[] = useMemo(
    () =>
      floors.map((f) => {
        const d = drafts[f.id];
        return {
          id: f.id,
          name: f.name,
          plannedStart: d?.plannedStart || f.plannedStart || null,
          plannedEnd: d?.plannedEnd || f.plannedEnd || null,
          markers: f.markers,
        };
      }),
    [floors, drafts]
  );

  const sCurve = useMemo(
    () => buildSCurveSeries(floorsForCurve),
    [floorsForCurve]
  );

  const range = useMemo(() => {
    const dates: Date[] = [];
    for (const f of floors) {
      const d = drafts[f.id];
      if (d?.plannedStart) dates.push(new Date(d.plannedStart));
      if (d?.plannedEnd) dates.push(new Date(d.plannedEnd));
      if (f.plannedStart) dates.push(new Date(f.plannedStart));
      if (f.plannedEnd) dates.push(new Date(f.plannedEnd));
    }
    if (dates.length < 2) {
      const start = new Date();
      start.setDate(1);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 3);
      return { start, end, totalDays: daysBetween(start, end) };
    }
    const start = new Date(Math.min(...dates.map((d) => d.getTime())));
    const end = new Date(Math.max(...dates.map((d) => d.getTime())));
    return { start, end, totalDays: daysBetween(start, end) };
  }, [floors, drafts]);

  const plannedOverall = sCurve.plannedToday;

  async function uploadPdf(file: File, password?: string) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      alert("Format harus PDF");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      alert("Ukuran file maksimal 30MB");
      return;
    }
    setUploading(true);
    setPdfError("");
    setMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (password) form.append("password", password);
      const res = await fetch(`/api/project/${projectId}/timeline-pdf`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal upload");
      setPdfUrl(data.timelinePdfUrl);
      setPdfModal(null);
      setPendingFile(null);
      setPdfPassword("");
      setMsg("PDF timeline tersimpan");
    } catch (err) {
      const m = err instanceof Error ? err.message : "Error";
      if (pdfModal) setPdfError(m);
      else alert(m);
    } finally {
      setUploading(false);
    }
  }

  async function confirmReplace() {
    if (!pendingFile) return;
    if (!pdfPassword) {
      setPdfError("Password wajib diisi");
      return;
    }
    await uploadPdf(pendingFile, pdfPassword);
  }

  async function deletePdf() {
    if (!pdfPassword) {
      setPdfError("Password wajib diisi");
      return;
    }
    setUploading(true);
    setPdfError("");
    try {
      const res = await fetch(`/api/project/${projectId}/timeline-pdf`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pdfPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal hapus");
      setPdfUrl(null);
      setPdfModal(null);
      setPdfPassword("");
      setMsg("PDF timeline dihapus");
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Error");
    } finally {
      setUploading(false);
    }
  }

  async function saveFloor(floorId: string) {
    const d = drafts[floorId];
    if (!d) return;
    setSavingId(floorId);
    setMsg("");
    try {
      const res = await fetch(
        `/api/project/${projectId}/floor/${floorId}/schedule`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plannedStart: d.plannedStart || null,
            plannedEnd: d.plannedEnd || null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal simpan");
      setFloors((prev) =>
        prev.map((f) =>
          f.id === floorId
            ? {
                ...f,
                plannedStart: data.plannedStart,
                plannedEnd: data.plannedEnd,
              }
            : f
        )
      );
      setMsg("Jadwal tersimpan");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingId(null);
    }
  }

  function barStyle(startStr: string, endStr: string) {
    if (!startStr || !endStr) return null;
    const s = new Date(startStr);
    const e = new Date(endStr);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) {
      return null;
    }
    const left =
      ((s.getTime() - range.start.getTime()) / (range.totalDays * 86400000)) *
      100;
    const width =
      ((e.getTime() - s.getTime()) / (range.totalDays * 86400000)) * 100;
    return {
      left: `${Math.max(0, Math.min(100, left))}%`,
      width: `${Math.max(1, Math.min(100 - left, width))}%`,
    };
  }

  const monthTicks = useMemo(() => {
    const ticks: { label: string; left: number }[] = [];
    const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    if (cursor < range.start) cursor.setMonth(cursor.getMonth() + 1);
    while (cursor <= range.end) {
      const left =
        ((cursor.getTime() - range.start.getTime()) /
          (range.totalDays * 86400000)) *
        100;
      if (left >= 0 && left <= 100) {
        ticks.push({
          label: cursor.toLocaleDateString("id-ID", {
            month: "short",
            year: "2-digit",
          }),
          left,
        });
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return ticks;
  }, [range]);

  const todayLeft = useMemo(() => {
    const now = Date.now();
    const left =
      ((now - range.start.getTime()) / (range.totalDays * 86400000)) * 100;
    if (left < 0 || left > 100) return null;
    return `${left}%`;
  }, [range]);

  const projectPlannedStyle = useMemo(() => {
    const starts: number[] = [];
    const ends: number[] = [];
    for (const f of floors) {
      const d = drafts[f.id];
      if (d?.plannedStart) starts.push(new Date(d.plannedStart).getTime());
      if (d?.plannedEnd) ends.push(new Date(d.plannedEnd).getTime());
    }
    if (!starts.length || !ends.length) return null;
    const s = Math.min(...starts);
    const e = Math.max(...ends);
    if (e <= s) return null;
    const left =
      ((s - range.start.getTime()) / (range.totalDays * 86400000)) * 100;
    const width = ((e - s) / (range.totalDays * 86400000)) * 100;
    return {
      left: `${Math.max(0, Math.min(100, left))}%`,
      width: `${Math.max(1, Math.min(100 - left, width))}%`,
    };
  }, [floors, drafts, range]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          Timeline
        </h1>
        <p className="text-sm text-slate-500">
          Kurva S, PDF rencana, dan planned vs actual per lantai
        </p>
      </div>

      {/* PDF rencana */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">
              Rencana Timeline (PDF)
            </h2>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (pdfUrl) {
                    setPendingFile(file);
                    setPdfPassword("");
                    setPdfError("");
                    setPdfModal("replace");
                  } else {
                    uploadPdf(file);
                  }
                }}
              />
              <Button
                size="sm"
                variant={pdfUrl ? "secondary" : "primary"}
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="mr-1 h-3.5 w-3.5" />
                {uploading ? "..." : pdfUrl ? "Ganti PDF" : "Upload PDF"}
              </Button>
              {pdfUrl && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={uploading}
                  onClick={() => {
                    setPdfPassword("");
                    setPdfError("");
                    setPdfModal("delete");
                  }}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Hapus
                </Button>
              )}
            </div>
          )}
        </div>

        {pdfUrl ? (
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Buka di tab baru
              </a>
              <span className="text-xs text-slate-400">max 30MB</span>
            </div>
            <iframe
              title="Timeline PDF"
              src={pdfUrl}
              className="h-[min(70vh,640px)] w-full rounded-lg border border-slate-200 bg-slate-50"
            />
          </div>
        ) : (
          <div className="px-4 py-10 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">
              Belum ada PDF rencana timeline
            </p>
            {canManage && (
              <p className="mt-1 text-xs text-slate-400">
                Upload file PDF jadwal / Gantt yang sudah dibuat
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Actual (progress)</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {projectActual}%
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Planned (waktu)</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {plannedOverall == null ? "—" : `${plannedOverall}%`}
          </p>
        </div>
        <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 lg:col-span-1">
          <p className="text-xs text-slate-500">Selisih (actual − planned)</p>
          <p
            className={cn(
              "mt-1 text-2xl font-bold",
              plannedOverall == null
                ? "text-slate-400"
                : projectActual >= plannedOverall
                  ? "text-emerald-700"
                  : "text-amber-700"
            )}
          >
            {plannedOverall == null
              ? "—"
              : `${projectActual - plannedOverall > 0 ? "+" : ""}${
                  Math.round((projectActual - plannedOverall) * 10) / 10
                }%`}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Kurva S</h2>
            <p className="text-xs text-slate-500">
              Planned (jadwal lantai, linear) vs Actual (item approved kumulatif)
            </p>
          </div>
          {sCurve.variance != null && (
            <p
              className={cn(
                "text-xs font-medium",
                sCurve.variance >= 0 ? "text-emerald-700" : "text-amber-700"
              )}
            >
              Hari ini: Actual {sCurve.actualToday}% · Planned{" "}
              {sCurve.plannedToday}% (
              {sCurve.variance > 0 ? "+" : ""}
              {sCurve.variance}%)
            </p>
          )}
        </div>
        <SCurveChart
          points={sCurve.points}
          hasSchedule={sCurve.hasSchedule}
        />
      </div>

      {msg && (
        <p
          className={cn(
            "text-sm",
            msg.includes("tersimpan") || msg.includes("dihapus")
              ? "text-emerald-600"
              : "text-red-600"
          )}
        >
          {msg}
        </p>
      )}

      {/* Gantt keseluruhan */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <GanttChart className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">
            Gantt keseluruhan
          </h2>
        </div>

        {floors.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            Belum ada lantai. Tambah lantai di menu Progress.
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="flex justify-between text-xs text-slate-400">
              <span>{range.start.toLocaleDateString("id-ID")}</span>
              <span>{range.end.toLocaleDateString("id-ID")}</span>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[520px] space-y-2">
                <div className="relative ml-[7.5rem] h-5 border-b border-slate-100 sm:ml-40">
                  {monthTicks.map((t) => (
                    <span
                      key={`${t.label}-${t.left}`}
                      className="absolute top-0 -translate-x-1/2 text-[10px] text-slate-400"
                      style={{ left: `${t.left}%` }}
                    >
                      {t.label}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-[7rem] shrink-0 sm:w-36">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      Proyek
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Actual {projectActual}%
                    </p>
                  </div>
                  <div className="relative h-9 flex-1 overflow-hidden rounded-md bg-slate-100">
                    {monthTicks.map((t) => (
                      <div
                        key={`grid-proj-${t.left}`}
                        className="absolute inset-y-0 w-px bg-slate-200/70"
                        style={{ left: `${t.left}%` }}
                      />
                    ))}
                    {todayLeft && (
                      <div
                        className="absolute inset-y-0 z-20 w-0.5 bg-rose-500"
                        style={{ left: todayLeft }}
                        title="Hari ini"
                      />
                    )}
                    {projectPlannedStyle ? (
                      <>
                        <div
                          className="absolute top-1.5 h-6 rounded bg-slate-300"
                          style={projectPlannedStyle}
                          title="Planned proyek"
                        />
                        <div
                          className="absolute top-2.5 z-10 h-4 rounded bg-brand transition-all"
                          style={{
                            left: projectPlannedStyle.left,
                            width: `calc(${projectPlannedStyle.width} * ${projectActual / 100})`,
                            maxWidth: projectPlannedStyle.width,
                          }}
                          title={`Actual ${projectActual}%`}
                        />
                      </>
                    ) : (
                      <div className="flex h-full items-center px-2 text-xs text-slate-400">
                        Isi tanggal planned per lantai di bawah
                      </div>
                    )}
                  </div>
                </div>

                {floors.map((f) => {
                  const actual = calcFloorProgress(
                    f.markers.map((m) => ({
                      items: m.items.map((i) => ({
                        bobot: i.bobot,
                        done: i.status === "APPROVED" || i.done,
                        progressPct: i.progressPct,
                      })),
                    }))
                  );
                  const d = drafts[f.id] || {
                    plannedStart: "",
                    plannedEnd: "",
                  };
                  const style = barStyle(d.plannedStart, d.plannedEnd);
                  return (
                    <div
                      key={`overview-${f.id}`}
                      className="flex items-center gap-2 sm:gap-3"
                    >
                      <div className="w-[7rem] shrink-0 sm:w-36">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {f.name}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {actual}%
                          {d.plannedStart && d.plannedEnd
                            ? ` · ${new Date(d.plannedStart).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – ${new Date(d.plannedEnd).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`
                            : ""}
                        </p>
                      </div>
                      <div className="relative h-8 flex-1 overflow-hidden rounded-md bg-slate-50">
                        {monthTicks.map((t) => (
                          <div
                            key={`grid-${f.id}-${t.left}`}
                            className="absolute inset-y-0 w-px bg-slate-200/60"
                            style={{ left: `${t.left}%` }}
                          />
                        ))}
                        {todayLeft && (
                          <div
                            className="absolute inset-y-0 z-20 w-0.5 bg-rose-500/80"
                            style={{ left: todayLeft }}
                          />
                        )}
                        {style ? (
                          <>
                            <div
                              className="absolute top-1 h-6 rounded bg-slate-300"
                              style={style}
                              title={`${f.name} planned`}
                            />
                            <div
                              className="absolute top-2 z-10 h-4 rounded bg-brand transition-all"
                              style={{
                                left: style.left,
                                width: `calc(${style.width} * ${actual / 100})`,
                                maxWidth: style.width,
                              }}
                              title={`${f.name} actual ${actual}%`}
                            />
                          </>
                        ) : (
                          <div className="flex h-full items-center px-2 text-[10px] text-slate-400">
                            Belum ada jadwal
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-6 rounded bg-slate-300" /> Planned
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-6 rounded bg-brand" /> Actual
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-0.5 bg-rose-500" /> Hari ini
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Edit jadwal per lantai */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <CalendarRange className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">
            Timeline per lantai
          </h2>
        </div>

        {floors.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            Belum ada lantai. Tambah lantai di menu Progress.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {floors.map((f) => {
              const actual = calcFloorProgress(
                f.markers.map((m) => ({
                  items: m.items.map((i) => ({
                    bobot: i.bobot,
                    done: i.status === "APPROVED" || i.done,
                    progressPct: i.progressPct,
                  })),
                }))
              );
              const d = drafts[f.id] || { plannedStart: "", plannedEnd: "" };
              const open = openFloorIds.has(f.id);
              const rangeLabel =
                d.plannedStart && d.plannedEnd
                  ? `${new Date(d.plannedStart).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – ${new Date(d.plannedEnd).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`
                  : "Belum di-set";
              return (
                <div key={f.id}>
                  <button
                    type="button"
                    onClick={() => toggleFloor(f.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                    aria-expanded={open}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{f.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        Actual {actual}% · {rangeLabel}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                        open && "rotate-180"
                      )}
                    />
                  </button>

                  {open && (
                    <div className="space-y-3 border-t border-slate-50 bg-slate-50/50 px-4 py-3">
                      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <Input
                          id={`start-${f.id}`}
                          label="Planned start"
                          type="date"
                          value={d.plannedStart}
                          disabled={!canManage}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [f.id]: { ...d, plannedStart: e.target.value },
                            }))
                          }
                        />
                        <Input
                          id={`end-${f.id}`}
                          label="Planned end"
                          type="date"
                          value={d.plannedEnd}
                          disabled={!canManage}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [f.id]: { ...d, plannedEnd: e.target.value },
                            }))
                          }
                        />
                        {canManage && (
                          <Button
                            size="sm"
                            className="sm:mt-6"
                            disabled={savingId === f.id}
                            onClick={() => saveFloor(f.id)}
                          >
                            <Save className="mr-1 h-3.5 w-3.5" />
                            {savingId === f.id ? "..." : "Simpan"}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={pdfModal === "replace"}
        onClose={() => {
          setPdfModal(null);
          setPendingFile(null);
          setPdfPassword("");
          setPdfError("");
        }}
        title="Ganti PDF timeline"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Masukkan password akun untuk mengganti file PDF.
          </p>
          <Input
            id="pdf-replace-pw"
            label="Password"
            type="password"
            value={pdfPassword}
            onChange={(e) => setPdfPassword(e.target.value)}
          />
          {pdfError && <p className="text-sm text-red-600">{pdfError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setPdfModal(null);
                setPendingFile(null);
              }}
            >
              Batal
            </Button>
            <Button disabled={uploading} onClick={confirmReplace}>
              {uploading ? "..." : "Ganti"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={pdfModal === "delete"}
        onClose={() => {
          setPdfModal(null);
          setPdfPassword("");
          setPdfError("");
        }}
        title="Hapus PDF timeline"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Masukkan password akun untuk menghapus PDF.
          </p>
          <Input
            id="pdf-delete-pw"
            label="Password"
            type="password"
            value={pdfPassword}
            onChange={(e) => setPdfPassword(e.target.value)}
          />
          {pdfError && <p className="text-sm text-red-600">{pdfError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPdfModal(null)}>
              Batal
            </Button>
            <Button disabled={uploading} onClick={deletePdf}>
              {uploading ? "..." : "Hapus"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

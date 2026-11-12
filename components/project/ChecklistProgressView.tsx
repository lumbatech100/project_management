"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { Check, Download, ExternalLink, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { checklistColumnShort } from "@/lib/door-profiles";
import { cellDisplay, type ChecklistMatrix } from "@/lib/checklist-matrix";
import { Button } from "@/components/ui/Button";

interface Props {
  projectId: string;
  matrix: ChecklistMatrix;
  /** Tanggal hari ini WIB YYYY-MM-DD */
  todayKey: string;
}

type StatusFilter = "all" | "done" | "running" | "idle";

/** Ribuan baris × puluhan kolom terlalu berat dirender sekaligus — tampilkan bertahap saat scroll. */
const ROW_BATCH = 100;

function csvEscape(v: string | number) {
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function ChecklistProgressView({
  projectId,
  matrix,
  todayKey,
}: Props) {
  const { columns, floors, projectPct } = matrix;
  const [floorFilter, setFloorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const stats = useMemo(() => {
    let done = 0;
    let running = 0;
    let idle = 0;
    for (const r of matrix.rows) {
      if (r.tone === "done") done += 1;
      else if (r.tone === "running") running += 1;
      else idle += 1;
    }
    return { done, running, idle, total: matrix.rows.length };
  }, [matrix.rows]);

  const rows = useMemo(
    () =>
      matrix.rows.filter(
        (r) =>
          (floorFilter === "all" || r.floorId === floorFilter) &&
          (statusFilter === "all" || r.tone === statusFilter)
      ),
    [matrix.rows, floorFilter, statusFilter]
  );

  const [rowLimit, setRowLimit] = useState(ROW_BATCH);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLTableRowElement>(null);
  const visibleRows = rows.length > rowLimit ? rows.slice(0, rowLimit) : rows;
  const hasMore = visibleRows.length < rows.length;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!hasMore || !sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRowLimit((n) => n + ROW_BATCH);
        }
      },
      { root: scrollRef.current, rootMargin: "600px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, rowLimit]);

  useEffect(() => {
    const showAll = () => flushSync(() => setRowLimit(Infinity));
    window.addEventListener("beforeprint", showAll);
    return () => window.removeEventListener("beforeprint", showAll);
  }, []);

  function changeFloor(id: string) {
    setFloorFilter(id);
    setRowLimit(ROW_BATCH);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  function changeStatus(s: StatusFilter) {
    setStatusFilter(s);
    setRowLimit(ROW_BATCH);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  function exportCsv() {
    const header = [
      "No",
      "Lantai",
      "Pintu",
      "Profil",
      "Progress titik %",
      ...columns,
    ];
    const lines = [
      header.map(csvEscape).join(","),
      ...rows.map((r, i) =>
        [
          i + 1,
          r.floorName,
          r.markerLabel,
          r.profile,
          r.markerPct,
          ...r.cells.map(cellDisplay),
        ]
          .map(csvEscape)
          .join(",")
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekap-progress-${todayKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Rekap Progress
          </h1>
          <p className="text-sm text-slate-500">
            Matrix Excel: ✓ selesai · % berjalan ·{" "}
            <span className="font-medium text-emerald-700">hijau = hari ini</span>
            {" · "}
            <span className="font-medium text-slate-800">
              hitam = kemarin & sebelumnya
            </span>
          </p>
          <p className="mt-1 text-sm tabular-nums text-slate-600">
            Progress project{" "}
            <span className="font-semibold text-slate-900">{projectPct}%</span>
            <span className="text-slate-400"> · </span>
            {rows.length} pintu · hari ini {todayKey}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={exportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export Excel (CSV)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Cetak
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5 print:hidden">
        {(
          [
            { id: "all" as const, label: "Semua", count: stats.total },
            { id: "done" as const, label: "Selesai", count: stats.done },
            { id: "running" as const, label: "Berjalan", count: stats.running },
            { id: "idle" as const, label: "Belum", count: stats.idle },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => changeStatus(t.id)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
              statusFilter === t.id
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
            )}
          >
            {t.label}
            <span
              className={cn(
                "ml-1.5",
                statusFilter === t.id ? "text-slate-300" : "text-slate-400"
              )}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-px print:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => changeFloor("all")}
          className={cn(
            "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors",
            floorFilter === "all"
              ? "border-brand font-medium text-brand"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          Semua lantai
        </button>
        {floors.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => changeFloor(f.id)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors",
              floorFilter === f.id
                ? "border-brand font-medium text-brand"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {f.name}
            <span className="ml-1.5 tabular-nums text-slate-400">{f.progress}%</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-[11px] text-slate-500 print:hidden">
        <span className="inline-flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          <span className="font-semibold text-emerald-700">Hijau</span> = dikerjakan
          hari ini (✓ / %)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5 text-slate-900" />
          <span className="font-semibold text-slate-900">Hitam</span> = kemarin &
          sebelumnya (✓ / %)
        </span>
        <span className="text-slate-400">kosong = belum mulai</span>
      </div>

      {rows.length === 0 ? (
        <p className="border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
          Tidak ada pintu untuk filter ini.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm print:rounded-none print:shadow-none">
          <div
            ref={scrollRef}
            className="max-h-[calc(100vh-240px)] overflow-auto print:max-h-none"
          >
            <table className="w-max min-w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-20">
                <tr className="bg-slate-100 text-slate-700">
                  <th className="sticky left-0 z-30 border border-slate-300 bg-slate-100 px-2 py-2 text-center font-semibold">
                    No
                  </th>
                  <th className="sticky left-8 z-30 border border-slate-300 bg-slate-100 px-2 py-2 font-semibold sm:left-10">
                    Lantai
                  </th>
                  <th className="sticky left-[5.5rem] z-30 border border-slate-300 bg-slate-100 px-2 py-2 font-semibold sm:left-28">
                    Pintu
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col}
                      title={col}
                      className="border border-slate-300 px-0.5 py-2 align-bottom font-semibold"
                    >
                      <div
                        className="mx-auto flex h-28 w-8 items-end justify-center pb-1 text-[10px] font-semibold leading-tight text-slate-700"
                        style={{
                          writingMode: "vertical-rl",
                          transform: "rotate(180deg)",
                        }}
                      >
                        {checklistColumnShort(col)}
                      </div>
                    </th>
                  ))}
                  <th className="border border-slate-300 px-2 py-2 text-right font-semibold">
                    %
                  </th>
                  <th className="border border-slate-300 px-2 py-2 text-center font-semibold print:hidden">
                    Map
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, i) => (
                  <tr
                    key={r.markerId}
                    className={cn(
                      "hover:bg-slate-50",
                      i % 2 === 1 && "bg-slate-50/50"
                    )}
                  >
                    <td className="sticky left-0 z-10 border border-slate-200 bg-white px-2 py-1.5 text-center tabular-nums text-slate-500">
                      {i + 1}
                    </td>
                    <td className="sticky left-8 z-10 border border-slate-200 bg-white px-2 py-1.5 font-medium text-slate-800 sm:left-10">
                      {r.floorName}
                    </td>
                    <td
                      className="sticky left-[5.5rem] z-10 max-w-[140px] truncate border border-slate-200 bg-white px-2 py-1.5 font-medium text-slate-900 sm:left-28"
                      title={`${r.markerLabel} · ${r.profile}`}
                    >
                      {r.markerLabel}
                    </td>
                    {r.cells.map((cell, ci) => {
                      const col = columns[ci]!;
                      if (!cell) {
                        return (
                          <td
                            key={col}
                            className="border border-slate-200 px-1 py-1.5"
                          />
                        );
                      }
                      const isToday =
                        (cell.kind === "done" || cell.kind === "pct") &&
                        cell.today;
                      return (
                        <td
                          key={col}
                          className={cn(
                            "border border-slate-200 px-1 py-1.5 text-center tabular-nums",
                            isToday && "bg-emerald-50/70",
                            cell.kind === "na" && "bg-slate-50 text-slate-300"
                          )}
                          title={
                            cell.kind === "done" || cell.kind === "pct"
                              ? `${col}${cell.today ? " · hari ini" : " · sebelumnya"}`
                              : col
                          }
                        >
                          {cell.kind === "done" ? (
                            <span
                              className={cn(
                                "font-bold",
                                cell.today
                                  ? "text-emerald-600"
                                  : "text-slate-900"
                              )}
                            >
                              ✓
                            </span>
                          ) : cell.kind === "pct" ? (
                            <span
                              className={cn(
                                "font-semibold",
                                cell.today
                                  ? "text-emerald-700"
                                  : "text-slate-900"
                              )}
                            >
                              {cell.value}%
                            </span>
                          ) : (
                            <span className="text-slate-300">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums text-slate-800">
                      {r.markerPct}%
                    </td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center print:hidden">
                      <Link
                        href={`/project/${projectId}/progress?marker=${r.markerId}`}
                        prefetch={false}
                        className="inline-flex text-slate-500 hover:text-slate-900"
                        title="Buka di Progress"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {hasMore && (
                  <tr ref={sentinelRef} className="print:hidden">
                    <td
                      colSpan={columns.length + 5}
                      className="border border-slate-200 px-2 py-3 text-left text-xs text-slate-400"
                    >
                      Memuat {rows.length - visibleRows.length} pintu lagi…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

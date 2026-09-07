"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  RefreshCw,
  Lock,
  LockOpen,
  Mail,
  ChevronRight,
  Send,
  Save,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Download,
  Printer,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EvidencePhotos } from "@/components/project/EvidencePhotos";
import { cn } from "@/lib/utils";
import {
  buildDailyReportHtml,
  formatIdDateLong,
  formatIdDateTime,
  groupReportItems,
  reportStatusLabelId,
  splitNewVsPending,
  statusLabelId,
} from "@/lib/daily-report-format";

type Meta = {
  activeWorkDate: string;
  jakartaToday: string;
  cutoffHour: number;
  timezone?: string;
};

type ReportRow = {
  id: string;
  workDate: string;
  status: string;
  closedAt?: string | null;
  emailStatus?: string | null;
  emailSentAt?: string | null;
  leaderSubmittedAt?: string | null;
  manpower?: number | null;
  workHours?: number | null;
  counts: {
    total: number;
    pendingSm: number;
    approved: number;
    submitted: number;
  };
};

type Snapshot = {
  reportId: string;
  projectId?: string;
  projectName?: string;
  workDate: string;
  status: string;
  closedAt: string | null;
  emailStatus: string | null;
  emailSentAt: string | null;
  manpower: number | null;
  workHours: number | null;
  notes: string | null;
  blocker: string | null;
  projectProgress: number | null;
  progressDetail: {
    project: number;
    floors: {
      name: string;
      progress: number;
      markers: { label: string; progress: number }[];
    }[];
  } | null;
  summary: string | null;
  leaderSubmittedAt: string | null;
  leaderSubmittedBy: string | null;
  counts: {
    submitted: number;
    approved: number;
    pendingSm: number;
    total: number;
  };
  items: {
    id: string;
    name: string;
    bobot: number;
    status: string;
    markerLabel: string;
    floorName: string;
    submittedBy: string | null;
    submittedAt: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    photoUrls: string[];
  }[];
  markerReports?: {
    id: string;
    markerId: string;
    markerLabel: string;
    floorName: string;
    blocker: string | null;
    notes: string | null;
    blockerPhotos: string[];
    status: string;
    submittedAt: string | null;
    submittedBy: string | null;
    reviewedAt: string | null;
    reviewedBy: string | null;
    rejectReason: string | null;
    markerProgress: number;
  }[];
  markerReportCounts?: {
    total: number;
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
  };
};

type ReportMeta = {
  manpower: number | null;
  workHours: number | null;
  notes: string | null;
  blocker: string | null;
  status: string;
  leaderSubmittedAt: string | null;
  leaderSubmittedBy: string | null;
};

interface Props {
  projectId: string;
  canManage: boolean;
  canApprove: boolean;
  canSend: boolean;
}

function isEditableStatus(status: string | undefined) {
  return status === "DRAFT" || status === "SUBMITTED" || status === "OPEN";
}

type PendingApproval = {
  id: string;
  markerId: string;
  floorId?: string;
  markerLabel: string;
  floorName: string;
  blocker: string | null;
  notes: string | null;
  blockerPhotos?: string[];
  submittedAt: string | null;
  submittedBy: string | null;
  workDate: string;
};

export function DailyReportView({
  projectId,
  canManage,
  canApprove,
  canSend,
}: Props) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    []
  );
  const [inboxActing, setInboxActing] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [reportMeta, setReportMeta] = useState<ReportMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [manpower, setManpower] = useState("");
  const [workHours, setWorkHours] = useState("");
  const [notes, setNotes] = useState("");
  const [blocker, setBlocker] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/project/${projectId}/daily-report`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat");
      setMeta(data.meta);
      setReports(data.reports || []);
      setPendingApprovals(data.pendingApprovals || []);
      setSelectedDate(
        (prev) =>
          prev || data.meta?.activeWorkDate || data.meta?.jakartaToday || null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadDetail = useCallback(
    async (date: string) => {
      setDetailLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/project/${projectId}/daily-report?date=${date}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal memuat detail");
        setSnapshot(data.snapshot);
        if (data.meta) setMeta(data.meta);

        const r = data.report;
        if (r) {
          setReportMeta({
            manpower: r.manpower ?? null,
            workHours: r.workHours ?? null,
            notes: r.notes ?? null,
            blocker: r.blocker ?? null,
            status: r.status,
            leaderSubmittedAt: r.leaderSubmittedAt ?? null,
            leaderSubmittedBy: r.leaderSubmittedBy ?? null,
          });
          setManpower(r.manpower != null ? String(r.manpower) : "");
          setWorkHours(r.workHours != null ? String(r.workHours) : "");
          setNotes(r.notes || "");
          setBlocker(r.blocker || "");
          setReports((prev) => {
            if (prev.some((row) => row.workDate === date)) return prev;
            return [
              {
                id: r.id,
                workDate: date,
                status: r.status,
                closedAt: r.closedAt,
                emailStatus: r.emailStatus,
                leaderSubmittedAt: r.leaderSubmittedAt,
                manpower: r.manpower,
                workHours: r.workHours,
                counts: data.snapshot?.counts || {
                  total: 0,
                  pendingSm: 0,
                  approved: 0,
                  submitted: 0,
                },
              },
              ...prev,
            ];
          });
        } else {
          setReportMeta(null);
          setManpower("");
          setWorkHours("");
          setNotes("");
          setBlocker("");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
        setSnapshot(null);
        setReportMeta(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (selectedDate) loadDetail(selectedDate);
  }, [selectedDate, loadDetail]);

  async function runAction(
    action: "close" | "reopen" | "retry-email" | "send" | "save-draft"
  ) {
    if (!selectedDate) return;
    setActing(true);
    setError("");
    setOkMsg("");
    try {
      const body: Record<string, unknown> = {
        action,
        date: selectedDate,
      };
      if (action === "send" || action === "save-draft") {
        body.manpower = manpower;
        body.workHours = workHours;
        body.notes = notes;
        body.blocker = blocker;
      }
      const res = await fetch(`/api/project/${projectId}/daily-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      if (action === "send") setOkMsg("Laporan harian berhasil dikirim.");
      if (action === "save-draft") setOkMsg("Draft tersimpan.");
      await loadList();
      await loadDetail(selectedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setActing(false);
    }
  }

  async function reviewInbox(
    item: PendingApproval,
    action: "approve" | "reject"
  ) {
    setInboxActing(item.id);
    setError("");
    setOkMsg("");
    try {
      const body: Record<string, unknown> = { action };
      if (action === "reject") {
        body.rejectReason = prompt("Alasan tolak (opsional):") || null;
      }
      const res = await fetch(
        `/api/project/${projectId}/marker/${item.markerId}/daily-report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      setOkMsg(
        action === "approve"
          ? `Approved: ${item.floorName} · ${item.markerLabel}`
          : `Ditolak: ${item.floorName} · ${item.markerLabel}`
      );
      await loadList();
      if (selectedDate) await loadDetail(selectedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setInboxActing(null);
    }
  }

  const status =
    snapshot?.status ||
    reportMeta?.status ||
    selectedRowStatus(reports, selectedDate);
  const isActiveDay =
    !!meta && !!selectedDate && selectedDate === meta.activeWorkDate;
  const canEditForm =
    canSend &&
    isActiveDay &&
    (!status || isEditableStatus(status)) &&
    status !== "CLOSED";
  const needsReminder =
    canSend &&
    isActiveDay &&
    (status === "DRAFT" || status === "OPEN" || !status) &&
    !reportMeta?.leaderSubmittedAt;

  const floorGroups = useMemo(
    () => (snapshot ? groupReportItems(snapshot.items) : []),
    [snapshot]
  );
  const activitySplit = useMemo(
    () =>
      snapshot
        ? splitNewVsPending(snapshot.items, snapshot.workDate)
        : { baru: [], lama: [] },
    [snapshot]
  );

  /** Preview memakai nilai form terkini (sebelum kirim) */
  const previewHtml = useMemo(() => {
    if (!snapshot) return "";
    const manpowerN =
      manpower === "" ? snapshot.manpower : parseInt(manpower, 10);
    const workHoursN =
      workHours === "" ? snapshot.workHours : parseFloat(workHours);
    const payload = {
      ...snapshot,
      projectId: snapshot.projectId || projectId,
      projectName: snapshot.projectName || "Project",
      manpower: Number.isFinite(manpowerN as number)
        ? (manpowerN as number)
        : snapshot.manpower,
      workHours: Number.isFinite(workHoursN as number)
        ? (workHoursN as number)
        : snapshot.workHours,
      notes: canEditForm ? notes.trim() || null : snapshot.notes,
      blocker: canEditForm ? blocker.trim() || null : snapshot.blocker,
    };
    return buildDailyReportHtml(payload as Parameters<typeof buildDailyReportHtml>[0], {
      projectUrl: `/project/${projectId}/laporan`,
    });
  }, [
    snapshot,
    projectId,
    manpower,
    workHours,
    notes,
    blocker,
    canEditForm,
  ]);

  function downloadPreview() {
    if (!previewHtml || !selectedDate) return;
    const blob = new Blob([previewHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-harian-${selectedDate}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printPreview() {
    if (!previewHtml) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(previewHtml);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Laporan Harian
          </h1>
          <p className="text-sm text-slate-500">
            Kirim laporan sebelum cutoff {meta?.cutoffHour ?? 19}:00 WIB
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            loadList();
            if (selectedDate) loadDetail(selectedDate);
          }}
          disabled={loading}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {meta && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Hari ini (WIB)" value={meta.jakartaToday} />
          <Stat label="Work date aktif" value={meta.activeWorkDate} />
          <Stat label="Timezone" value={meta.timezone || "Asia/Jakarta"} />
        </div>
      )}

      {canApprove && (
        <div className="overflow-hidden rounded-xl border border-amber-200 bg-white">
          <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-3">
            <Inbox className="h-4 w-4 text-amber-700" />
            <h2 className="text-sm font-semibold text-amber-900">
              Menunggu approval
            </h2>
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
              {pendingApprovals.length}
            </span>
          </div>
          {pendingApprovals.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">
              Tidak ada laporan titik menunggu approval
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pendingApprovals.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {p.floorName} · {p.markerLabel}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatIdDateLong(p.workDate)}
                      {p.submittedBy ? ` · ${p.submittedBy}` : ""}
                      {p.submittedAt
                        ? ` · ${new Date(p.submittedAt).toLocaleString("id-ID")}`
                        : ""}
                    </p>
                    {p.blocker && (
                      <p className="mt-1 text-xs text-amber-800">
                        Blocker: {p.blocker}
                      </p>
                    )}
                    <EvidencePhotos
                      className="mt-2"
                      urls={p.blockerPhotos || []}
                      label="Foto bukti blocker"
                    />
                    {p.notes && (
                      <p className="text-xs text-slate-600">Catatan: {p.notes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      href={`/project/${projectId}/progress?marker=${p.markerId}`}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Lihat
                    </Link>
                    <Button
                      size="sm"
                      disabled={inboxActing === p.id}
                      onClick={() => reviewInbox(p, "approve")}
                    >
                      Acc
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={inboxActing === p.id}
                      onClick={() => reviewInbox(p, "reject")}
                    >
                      Tolak
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {needsReminder && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-medium text-amber-900">
              Laporan hari ini belum dikirim
            </p>
            <p className="mt-0.5 text-xs text-amber-700">
              Submit <span className="font-semibold">laporan titik</span> dari
              Progress (beserta blocker per titik). SM akan approve. Auto-close &
              email jam {meta?.cutoffHour ?? 19}:00 WIB.
            </p>
          </div>
        </div>
      )}

      {status === "SUBMITTED" && isActiveDay && canSend && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-medium text-emerald-900">
              Laporan sudah dikirim
            </p>
            <p className="mt-0.5 text-xs text-emerald-700">
              {reportMeta?.leaderSubmittedBy
                ? `Oleh ${reportMeta.leaderSubmittedBy}`
                : "Sudah submit"}
              {reportMeta?.leaderSubmittedAt
                ? ` · ${new Date(reportMeta.leaderSubmittedAt).toLocaleString("id-ID")}`
                : ""}
              . Anda masih bisa update draft lalu kirim ulang sampai cutoff.
            </p>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {okMsg && <p className="text-sm text-emerald-600">{okMsg}</p>}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <ClipboardList className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">
              Riwayat report
            </h2>
          </div>
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              Memuat...
            </p>
          ) : reports.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              Belum ada laporan. Pilih tanggal aktif di kanan untuk mulai draft.
            </p>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {reports.map((r) => {
                const active = r.workDate === selectedDate;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(r.workDate)}
                      className={cn(
                        "flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50",
                        active && "bg-slate-50"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {formatIdDateLong(r.workDate)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {r.counts.total} item · {r.counts.pendingSm} pending
                          SM · {r.counts.approved} approved
                        </p>
                      </div>
                      <StatusPill status={r.status} />
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {selectedDate ? formatIdDateLong(selectedDate) : "Detail"}
              </h2>
              {snapshot && (
                <p className="text-xs text-slate-500">
                  {reportStatusLabelId(snapshot.status)}
                  {snapshot.emailStatus
                    ? ` · Email: ${snapshot.emailStatus}`
                    : ""}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {snapshot && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPreviewOpen(true)}
                >
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  Preview
                </Button>
              )}
              {canManage && selectedDate && (
                <>
                  {status !== "CLOSED" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={acting}
                      onClick={() => runAction("close")}
                    >
                      <Lock className="mr-1 h-3.5 w-3.5" />
                      Tutup
                    </Button>
                  )}
                  {status === "CLOSED" && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={acting}
                        onClick={() => runAction("reopen")}
                      >
                        <LockOpen className="mr-1 h-3.5 w-3.5" />
                        Buka lagi
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={acting}
                        onClick={() => runAction("retry-email")}
                      >
                        <Mail className="mr-1 h-3.5 w-3.5" />
                        Retry email
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {detailLoading ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              Memuat detail...
            </p>
          ) : !snapshot && !canEditForm ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              Tidak ada data untuk tanggal ini.
              {canManage && (
                <>
                  {" "}
                  Admin bisa{" "}
                  <button
                    type="button"
                    className="font-medium text-slate-800 underline"
                    onClick={() => runAction("close")}
                  >
                    tutup / buat report kosong
                  </button>
                  .
                </>
              )}
            </p>
          ) : (
            <div className="space-y-4 p-4">
              {canEditForm && (
                <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    Form laporan harian
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Jumlah pekerja (manpower)"
                      type="number"
                      min={0}
                      value={manpower}
                      onChange={(e) => setManpower(e.target.value)}
                      placeholder="contoh: 12"
                    />
                    <Input
                      label="Jam kerja"
                      type="number"
                      min={0}
                      step="0.5"
                      value={workHours}
                      onChange={(e) => setWorkHours(e.target.value)}
                      placeholder="contoh: 8"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Catatan / cuaca
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Opsional — cuaca atau catatan umum"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Blocker sekarang diisi <strong>per titik</strong> saat submit
                    laporan titik di menu Progress. SM approve tiap titik; jam
                    cutoff laporan digabung & dikirim otomatis.
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={acting}
                      onClick={() => runAction("save-draft")}
                    >
                      <Save className="mr-1 h-3.5 w-3.5" />
                      Simpan draft
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPreviewOpen(true)}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      disabled={acting}
                      onClick={() => runAction("send")}
                    >
                      <Send className="mr-1 h-3.5 w-3.5" />
                      Kirim laporan harian
                    </Button>
                  </div>
                </div>
              )}

              {snapshot && (
                <>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Header
                    </p>
                    <dl className="mt-2 space-y-1.5">
                      {snapshot.projectName && (
                        <HeaderRow
                          label="Project"
                          value={snapshot.projectName}
                        />
                      )}
                      <HeaderRow
                        label="Tanggal kerja"
                        value={`${formatIdDateLong(snapshot.workDate)} (WIB)`}
                      />
                      <HeaderRow
                        label="Status"
                        value={reportStatusLabelId(snapshot.status)}
                      />
                      <HeaderRow
                        label="Dikirim Leader"
                        value={
                          snapshot.leaderSubmittedAt
                            ? `${snapshot.leaderSubmittedBy || "—"} · ${formatIdDateTime(snapshot.leaderSubmittedAt)}`
                            : "Belum dikirim"
                        }
                      />
                      {snapshot.closedAt && (
                        <HeaderRow
                          label="Waktu close"
                          value={formatIdDateTime(snapshot.closedAt)}
                        />
                      )}
                    </dl>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Ringkasan lapangan
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <MiniStat
                        label="Manpower"
                        value={
                          snapshot.manpower != null
                            ? String(snapshot.manpower)
                            : "—"
                        }
                      />
                      <MiniStat
                        label="Jam kerja"
                        value={
                          snapshot.workHours != null
                            ? String(snapshot.workHours)
                            : "—"
                        }
                      />
                      <MiniStat
                        label="Total item"
                        value={String(snapshot.counts.total)}
                      />
                      <MiniStat
                        label="Menunggu SM"
                        value={String(snapshot.counts.pendingSm)}
                      />
                      <MiniStat
                        label="Approved"
                        value={String(snapshot.counts.approved)}
                      />
                    </div>
                    {snapshot.notes && (
                      <p className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm text-slate-700">
                        <span className="font-medium text-slate-900">
                          Catatan:{" "}
                        </span>
                        {snapshot.notes}
                      </p>
                    )}
                    {snapshot.blocker && (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        <span className="font-medium">Blocker: </span>
                        {snapshot.blocker}
                      </p>
                    )}
                  </div>

                  {(snapshot.markerReports?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Laporan per titik
                      </p>
                      <p className="text-xs text-slate-500">
                        {snapshot.markerReportCounts?.submitted ?? 0} menunggu SM
                        · {snapshot.markerReportCounts?.approved ?? 0} approved
                        · {snapshot.markerReportCounts?.rejected ?? 0} ditolak
                      </p>
                      <ul className="space-y-2">
                        {snapshot.markerReports!.map((mr) => (
                          <li
                            key={mr.id}
                            className="rounded-lg border border-slate-100 px-3 py-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900">
                                  {mr.floorName} · {mr.markerLabel}
                                </p>
                                <p className="text-xs text-slate-500">
                                  Progress {mr.markerProgress}%
                                  {mr.submittedBy
                                    ? ` · ${mr.submittedBy}`
                                    : ""}
                                </p>
                                {mr.blocker && (
                                  <p className="mt-1 text-xs text-amber-800">
                                    Blocker: {mr.blocker}
                                  </p>
                                )}
                                <EvidencePhotos
                                  className="mt-2"
                                  urls={mr.blockerPhotos || []}
                                  label="Foto bukti blocker"
                                />
                              </div>
                              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                {mr.status === "APPROVED"
                                  ? "Approved"
                                  : mr.status === "SUBMITTED"
                                    ? "Menunggu SM"
                                    : mr.status === "REJECTED"
                                      ? "Ditolak"
                                      : "Draft"}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Progress
                    </p>
                    {(() => {
                      const reportedNames = new Set([
                        ...snapshot.items.map((i) => i.floorName),
                        ...(snapshot.markerReports || []).map((m) => m.floorName),
                      ]);
                      const reportedFloors =
                        snapshot.progressDetail?.floors.filter((f) =>
                          reportedNames.has(f.name)
                        ) || [];
                      // Fallback: kalau belum ada item submit, jangan list semua lantai
                      if (reportedFloors.length === 0 && reportedNames.size === 0) {
                        return (
                          <ProgressGanttRow
                            label="Progress keseluruhan"
                            percent={snapshot.projectProgress}
                            emphasize
                          />
                        );
                      }
                      return (
                        <>
                          {reportedFloors.map((floor) => (
                            <ProgressGanttRow
                              key={floor.name}
                              label={floor.name}
                              percent={floor.progress}
                            />
                          ))}
                          <ProgressGanttRow
                            label="Progress keseluruhan"
                            percent={snapshot.projectProgress}
                            emphasize
                          />
                        </>
                      );
                    })()}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                      Detail pekerjaan
                    </p>
                    {floorGroups.length === 0 ? (
                      <p className="py-4 text-center text-sm text-slate-400">
                        Belum ada item submit di tanggal ini.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {floorGroups.map((floor) => (
                          <div key={floor.floorName} className="space-y-2">
                            <div className="flex items-baseline justify-between gap-2">
                              <h3 className="text-sm font-semibold text-slate-900">
                                {floor.floorName}
                              </h3>
                              <span className="text-xs text-slate-500">
                                {floor.itemCount} item · progress{" "}
                                {floor.progress}%
                              </span>
                            </div>
                            {floor.markers.map((mg) => (
                              <div
                                key={`${floor.floorName}-${mg.markerLabel}`}
                                className="overflow-hidden rounded-lg border border-slate-100"
                              >
                                <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2">
                                  <p className="text-sm font-medium text-slate-800">
                                    {mg.markerLabel}
                                  </p>
                                  <span className="text-xs text-slate-500">
                                    {mg.progress}%
                                  </span>
                                </div>
                                <ul className="divide-y divide-slate-100">
                                  {mg.items.map((item) => (
                                    <li
                                      key={item.id}
                                      className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between"
                                    >
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium text-slate-900">
                                          {item.name}{" "}
                                          <span className="font-normal text-slate-400">
                                            · {item.bobot}%
                                          </span>
                                        </p>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                          {item.submittedBy
                                            ? `Submit: ${item.submittedBy} · ${formatIdDateTime(item.submittedAt)}`
                                            : "Belum submit"}
                                        </p>
                                        {item.status === "APPROVED" &&
                                          item.approvedBy && (
                                            <p className="text-xs text-slate-500">
                                              Approve: {item.approvedBy} ·{" "}
                                              {formatIdDateTime(
                                                item.approvedAt
                                              )}
                                            </p>
                                          )}
                                        {item.status === "SUBMITTED" && (
                                          <p className="text-xs text-amber-600">
                                            Menunggu approval SM
                                          </p>
                                        )}
                                        <EvidencePhotos
                                          className="mt-2"
                                          urls={item.photoUrls || []}
                                          label="Foto bukti"
                                        />
                                      </div>
                                      <ItemStatus status={item.status} />
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {snapshot.items.length > 0 && (
                    <div className="space-y-3 border-t border-slate-100 pt-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Aktivitas hari ini vs pending
                      </p>
                      <div>
                        <p className="text-xs font-semibold text-slate-600">
                          Baru dikerjakan / di-submit hari ini (
                          {activitySplit.baru.length})
                        </p>
                        {activitySplit.baru.length === 0 ? (
                          <p className="mt-1 text-xs text-slate-400">
                            Tidak ada
                          </p>
                        ) : (
                          <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                            {activitySplit.baru.map((i) => (
                              <li key={i.id}>
                                {i.floorName} / {i.markerLabel} — {i.name} (
                                {statusLabelId(i.status)})
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-600">
                          Pending / dari hari sebelumnya (
                          {activitySplit.lama.length})
                        </p>
                        {activitySplit.lama.length === 0 ? (
                          <p className="mt-1 text-xs text-slate-400">
                            Tidak ada
                          </p>
                        ) : (
                          <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
                            {activitySplit.lama.map((i) => (
                              <li key={i.id}>
                                {i.floorName} / {i.markerLabel} — {i.name} (
                                {statusLabelId(i.status)})
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="border-t border-slate-100 pt-3 text-center text-[11px] text-slate-400">
                    Dikirim otomatis oleh Simplo PMS
                  </p>
                </>
              )}

              {!snapshot && canEditForm && (
                <p className="text-center text-sm text-slate-400">
                  Draft akan dibuat saat Anda simpan atau kirim.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Preview laporan harian"
        className="sm:max-w-3xl lg:max-w-4xl"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Cek hasil sebelum kirim email / print. Preview memakai data form
            terkini.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={downloadPreview}>
              <Download className="mr-1 h-3.5 w-3.5" />
              Download HTML
            </Button>
            <Button size="sm" variant="secondary" onClick={printPreview}>
              <Printer className="mr-1 h-3.5 w-3.5" />
              Print
            </Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <iframe
              title="Preview laporan"
              srcDoc={previewHtml}
              className="h-[65dvh] w-full bg-white"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function HeaderRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function selectedRowStatus(
  reports: ReportRow[],
  selectedDate: string | null
): string | undefined {
  return reports.find((r) => r.workDate === selectedDate)?.status;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function ProgressGanttRow({
  label,
  percent,
  emphasize,
}: {
  label: string;
  percent: number | null | undefined;
  emphasize?: boolean;
}) {
  const p = percent ?? 0;
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        emphasize
          ? "border-slate-800 bg-slate-900 text-white"
          : "border-slate-100 bg-white"
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p
          className={cn(
            "text-sm font-semibold",
            emphasize ? "text-white" : "text-slate-900"
          )}
        >
          {label}
        </p>
        <span
          className={cn(
            "text-sm font-bold tabular-nums",
            emphasize ? "text-white" : "text-slate-800"
          )}
        >
          {percent != null ? `${percent}%` : "—"}
        </span>
      </div>
      <div
        className={cn(
          "h-2.5 overflow-hidden rounded-full",
          emphasize ? "bg-slate-700" : "bg-slate-100"
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            emphasize ? "bg-emerald-400" : "bg-slate-900"
          )}
          style={{ width: `${Math.min(100, Math.max(0, p))}%` }}
        />
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
        status === "DRAFT" && "bg-slate-100 text-slate-600",
        status === "OPEN" && "bg-slate-100 text-slate-600",
        status === "SUBMITTED" && "bg-amber-50 text-amber-700",
        status === "CLOSED" && "bg-slate-800 text-white"
      )}
    >
      {reportStatusLabelId(status)}
    </span>
  );
}

function ItemStatus({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
        status === "APPROVED" && "bg-emerald-50 text-emerald-700",
        status === "SUBMITTED" && "bg-amber-50 text-amber-700",
        status === "OPEN" && "bg-slate-100 text-slate-500"
      )}
    >
      {statusLabelId(status)}
    </span>
  );
}

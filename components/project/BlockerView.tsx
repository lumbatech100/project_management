"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type Tab = "all" | "open" | "closed";

type IssueSummary = {
  id: string;
  blocker: string | null;
  reportStatus: string;
  submittedAt: string | null;
  submittedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  workDate: string;
  markerLabel: string;
  floorName: string;
  commentCount: number;
  lastComment: { at: string; authorName: string; body: string } | null;
  unread: boolean;
};

type IssueDetail = {
  id: string;
  blocker: string | null;
  blockerPhotos: string[];
  reportStatus: string;
  submittedAt: string | null;
  submittedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  workDate: string;
  markerLabel: string;
  floorName: string;
  comments: {
    id: string;
    body: string;
    authorName: string;
    userId: string | null;
    createdAt: string;
  }[];
};

function formatDate(key: string) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatWhen(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const REPORT_LABEL: Record<string, string> = {
  SUBMITTED: "Menunggu approval",
  APPROVED: "Laporan disetujui",
  REJECTED: "Laporan ditolak",
};

export function BlockerView({
  projectId,
  isAdmin,
  userId,
}: {
  projectId: string;
  isAdmin: boolean;
  userId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(
    async (next: Tab) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/project/${projectId}/blocker?tab=${next}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Gagal memuat blocker");
        setIssues(json.issues || []);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    loadList(tab);
  }, [tab, loadList]);

  async function openIssue(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/project/${projectId}/blocker/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal membuka isu");
      setDetail(json.issue);
      setIssues((prev) => prev.map((row) => (row.id === id ? { ...row, unread: false } : row)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setDetailLoading(false);
    }
  }

  async function send(action: "comment" | "close") {
    if (!selectedId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/project/${projectId}/blocker/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, body: draft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal");
      setDraft("");
      if (action === "close") {
        setDetail(null);
        setSelectedId(null);
        await loadList(tab);
      } else if (json.issue) {
        setDetail(json.issue);
        setIssues((prev) =>
          prev.map((row) =>
            row.id === json.issue.id
              ? {
                  ...row,
                  commentCount: json.issue.comments.length,
                  unread: false,
                  lastComment: json.issue.comments.length
                    ? {
                        at: json.issue.comments[json.issue.comments.length - 1].createdAt,
                        authorName: json.issue.comments[json.issue.comments.length - 1].authorName,
                        body: json.issue.comments[json.issue.comments.length - 1].body,
                      }
                    : null,
                }
              : row
          )
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Blocker</h1>
          <p className="text-sm text-slate-500">
            Kendala yang diisi di laporan harian. Komentar untuk semua role. Tutup isu hanya Admin.
          </p>
        </div>
        <div className="flex gap-1.5">
          {(
            [
              ["all", "Semua"],
              ["open", "Terbuka"],
              ["closed", "Closed"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium",
                tab === key
                  ? "border-brand bg-brand text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
        <div className="space-y-2">
          {loading ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              Memuat...
            </p>
          ) : issues.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
              {tab === "closed"
                ? "Belum ada blocker yang ditutup."
                : tab === "open"
                  ? "Tidak ada blocker terbuka."
                  : "Belum ada blocker."}
            </p>
          ) : (
            issues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => openIssue(issue.id)}
                className={cn(
                  "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                  selectedId === issue.id
                    ? "border-brand bg-white"
                    : "border-slate-200 bg-white hover:border-slate-400"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={cn("text-sm text-slate-900", issue.unread && "font-bold")}>
                    {issue.floorName} · {issue.markerLabel}
                  </p>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {issue.closedAt ? (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        Closed
                      </span>
                    ) : null}
                    {issue.unread ? (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    ) : null}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{issue.blocker}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {formatDate(issue.workDate)}
                  {issue.commentCount ? ` · ${issue.commentCount} komentar` : ""}
                  {issue.submittedBy ? ` · ${issue.submittedBy}` : ""}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          {!selectedId ? (
            <p className="py-10 text-center text-sm text-slate-400">Pilih isu untuk melihat detail.</p>
          ) : detailLoading || !detail ? (
            <p className="py-10 text-center text-sm text-slate-400">Memuat isu...</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {detail.floorName} · {detail.markerLabel}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {formatDate(detail.workDate)}
                    {detail.submittedBy ? ` · dicatat ${detail.submittedBy}` : ""}
                    {detail.submittedAt ? ` · ${formatWhen(detail.submittedAt)}` : ""}
                    {" · "}
                    {REPORT_LABEL[detail.reportStatus] || detail.reportStatus}
                  </p>
                </div>
                {isAdmin && !detail.closedAt ? (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => send("close")}>
                    Tutup isu
                  </Button>
                ) : null}
              </div>

              {detail.closedAt ? (
                <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
                  Ditutup{detail.closedBy ? ` oleh ${detail.closedBy}` : ""}
                  {detail.closedAt ? ` · ${formatWhen(detail.closedAt)}` : ""}
                </p>
              ) : null}

              <p className="whitespace-pre-wrap text-sm text-slate-800">{detail.blocker}</p>

              {detail.blockerPhotos.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {detail.blockerPhotos.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="Foto blocker"
                        className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
                      />
                    </a>
                  ))}
                </div>
              ) : null}

              <div className="space-y-3 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Komentar
                </p>
                {detail.comments.length === 0 ? (
                  <p className="text-sm text-slate-400">Belum ada komentar.</p>
                ) : (
                  detail.comments.map((c) => (
                    <div key={c.id} className="rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">
                        <span className={cn(c.userId === userId && "font-semibold text-slate-700")}>
                          {c.authorName}
                        </span>
                        {" · "}
                        {formatWhen(c.createdAt)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{c.body}</p>
                    </div>
                  ))
                )}
              </div>

              {detail.closedAt ? (
                <p className="text-sm text-slate-400">Isu ditutup. Komentar baru tidak bisa ditambah.</p>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    placeholder="Tulis komentar"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                  <div className="flex justify-end">
                    <Button size="sm" disabled={busy || !draft.trim()} onClick={() => send("comment")}>
                      {busy ? "..." : "Kirim komentar"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

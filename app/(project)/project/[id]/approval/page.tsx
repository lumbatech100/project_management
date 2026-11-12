import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronRight, Inbox } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasMenu } from "@/lib/menus";
import {
  calcMarkerProgress,
  canApproveProgress,
  isViewOnlyRole,
} from "@/lib/utils";
import { profileLabel } from "@/lib/door-profiles";

function formatWhen(value: Date | null) {
  if (!value) return null;
  return value.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PendingApprovalPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await getSession();
  const menus = session?.user?.menus || [];

  const viewOnly = !!session?.user && isViewOnlyRole(session.user.role);

  if (
    !session?.user ||
    !hasMenu(menus, "project.approval") ||
    (!viewOnly && !canApproveProgress(session.user.role, session.user.menus))
  ) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="font-medium text-slate-700">Akses ditolak</p>
        <p className="mt-1 text-sm text-slate-500">
          Anda tidak punya privilege menu Pending Approval
        </p>
      </div>
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) notFound();

  const markers = await prisma.marker.findMany({
    where: {
      floor: { projectId: project.id },
      OR: [
        { items: { some: { status: "SUBMITTED" } } },
        { markerReports: { some: { status: "SUBMITTED" } } },
      ],
    },
    include: {
      floor: { select: { name: true } },
      items: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      markerReports: {
        where: { status: "SUBMITTED" },
        orderBy: { submittedAt: "desc" },
        take: 1,
        select: { submittedAt: true, submittedBy: true, blocker: true },
      },
    },
  });

  const rows = markers
    .map((m) => {
      const pendingItems = m.items.filter((i) => i.status === "SUBMITTED");
      const report = m.markerReports[0] ?? null;
      const submittedAt =
        report?.submittedAt ??
        pendingItems.reduce<Date | null>(
          (latest, i) =>
            i.submittedAt && (!latest || i.submittedAt > latest)
              ? i.submittedAt
              : latest,
          null
        );
      const submittedBy =
        report?.submittedBy ??
        pendingItems.find((i) => i.submittedBy)?.submittedBy ??
        null;

      return {
        id: m.id,
        label: m.label,
        floorName: m.floor.name,
        profileCode: m.profileCode,
        progress: calcMarkerProgress(m.items),
        pendingCount: pendingItems.length,
        pendingNames: pendingItems.map((i) => i.name),
        blocker: report?.blocker || null,
        submittedAt,
        submittedBy,
      };
    })
    .sort((a, b) => {
      const at = a.submittedAt?.getTime() ?? 0;
      const bt = b.submittedAt?.getTime() ?? 0;
      return bt - at;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pending Approval</h1>
          <p className="mt-1 text-sm text-slate-500">
            {viewOnly
              ? "Titik pekerjaan yang di-submit Leader dan menunggu approval Site Manager"
              : "Titik pekerjaan yang di-submit Leader dan menunggu keputusan Anda"}
          </p>
        </div>
        <span className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
          {rows.length} menunggu
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 py-16 text-center">
          <Inbox className="h-8 w-8 text-slate-300" />
          <p className="mt-3 font-medium text-slate-700">
            Tidak ada yang menunggu approval
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Semua submission Leader sudah diproses
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/project/${project.id}/progress?marker=${row.id}&from=approval`}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{row.label}</p>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                      {row.floorName}
                    </span>
                    {row.profileCode && (
                      <span className="rounded bg-brand px-1.5 py-0.5 text-[11px] font-medium text-white">
                        {profileLabel(row.profileCode)}
                      </span>
                    )}
                    {row.blocker && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                        <AlertTriangle className="h-3 w-3" />
                        Ada blocker
                      </span>
                    )}
                  </div>

                  <p className="mt-1.5 text-sm text-slate-600">
                    {row.pendingCount > 0
                      ? `${row.pendingCount} pekerjaan menunggu: ${row.pendingNames.slice(0, 3).join(", ")}${
                          row.pendingNames.length > 3
                            ? ` +${row.pendingNames.length - 3} lain`
                            : ""
                        }`
                      : "Laporan titik menunggu approval"}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    Progress sekarang {row.progress}%
                    {row.submittedBy ? ` · submit oleh ${row.submittedBy}` : ""}
                    {formatWhen(row.submittedAt)
                      ? ` · ${formatWhen(row.submittedAt)}`
                      : ""}
                  </p>
                </div>

                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

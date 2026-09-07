import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canApproveProgress,
  canManageDrawing,
  canSubmitProgress,
} from "@/lib/utils";
import { getActiveWorkDate } from "@/lib/workday";
import { FloorView } from "@/components/project/progress/FloorView";

export default async function ProgressPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { marker?: string };
}) {
  const session = await getSession();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      floors: {
        orderBy: { createdAt: "asc" },
        include: {
          markers: {
            include: { items: { orderBy: { name: "asc" } } },
          },
        },
      },
    },
  });

  if (!project) notFound();

  const workDate = getActiveWorkDate();
  const pending = await prisma.markerDailyReport.findMany({
    where: {
      status: "SUBMITTED",
      dailyReport: {
        projectId: project.id,
        workDate,
        status: { not: "CLOSED" },
      },
    },
    select: { markerId: true },
  });
  const pendingMarkerIds = pending.map((p) => p.markerId);
  const canApprove = canApproveProgress(session!.user.role);
  const initialMarkerId =
    searchParams?.marker &&
    project.floors.some((f) =>
      f.markers.some((m) => m.id === searchParams.marker)
    )
      ? searchParams.marker
      : null;

  return (
    <div className="space-y-3">
      {canApprove && pendingMarkerIds.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-900">
            <span className="font-semibold">{pendingMarkerIds.length}</span>{" "}
            laporan titik menunggu approval hari ini
          </p>
          <Link
            href={`/project/${project.id}/laporan`}
            className="text-sm font-medium text-amber-950 underline underline-offset-2"
          >
            Buka inbox Laporan Harian
          </Link>
        </div>
      )}
      <FloorView
        projectId={project.id}
        floors={project.floors}
        canManage={canManageDrawing(session!.user.role)}
        canSubmit={canSubmitProgress(session!.user.role)}
        canApprove={canApprove}
        pendingMarkerIds={pendingMarkerIds}
        initialMarkerId={initialMarkerId}
      />
    </div>
  );
}

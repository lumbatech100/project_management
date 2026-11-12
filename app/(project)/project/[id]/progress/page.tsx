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
import { parsePlotRegion } from "@/lib/plot-region";
import { FloorView } from "@/components/project/progress/FloorView";
import { hasMenu } from "@/lib/menus";
import { compactItem, FLOOR_VIEW_ITEM_SELECT } from "@/lib/progress-payload";

export default async function ProgressPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ marker?: string; from?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const session = await getSession();
  if (!hasMenu(session?.user?.menus, "project.progress")) notFound();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      floors: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          drawingUrl: true,
          drawingHiUrl: true,
          plotRegion: true,
          markers: {
            select: {
              id: true,
              label: true,
              x: true,
              y: true,
              profileCode: true,
              hasKeyswitch: true,
              color: true,
              items: {
                orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                select: FLOOR_VIEW_ITEM_SELECT,
              },
            },
          },
        },
      },
    },
  });

  if (!project) notFound();

  const floors = project.floors.map((f) => ({
    ...f,
    plotRegion: parsePlotRegion(f.plotRegion),
    markers: f.markers.map((m) => ({ ...m, items: m.items.map(compactItem) })),
  }));

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
  const canApprove = canApproveProgress(session!.user.role, session!.user.menus);
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
        floors={floors}
        canManage={canManageDrawing(session!.user.role, session!.user.menus)}
        canSubmit={canSubmitProgress(session!.user.role, session!.user.menus)}
        canApprove={canApprove}
        pendingMarkerIds={pendingMarkerIds}
        initialMarkerId={initialMarkerId}
        returnTo={
          searchParams?.from === "approval"
            ? `/project/${project.id}/approval`
            : null
        }
      />
    </div>
  );
}

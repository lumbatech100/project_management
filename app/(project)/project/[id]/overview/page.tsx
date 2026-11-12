import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasMenu } from "@/lib/menus";
import { prisma } from "@/lib/prisma";
import {
  calcFloorProgress,
  calcMarkerProgress,
  calcProjectProgress,
} from "@/lib/utils";
import { PROGRESS_CALC_ITEM_SELECT } from "@/lib/progress-payload";
import { ProjectSummary } from "@/components/project/ProjectSummary";

export default async function ProjectOverviewPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await getSession();
  // URL lama kartu project → arahkan ke menu pertama yang boleh dibuka
  if (!hasMenu(session?.user?.menus, "project.overview")) {
    redirect(`/project/${params.id}`);
  }

  const [project, recentDone] = await Promise.all([
    prisma.project.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        createdAt: true,
        floors: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            markers: {
              select: {
                id: true,
                label: true,
                items: { select: PROGRESS_CALC_ITEM_SELECT },
              },
            },
          },
        },
      },
    }),
    prisma.breakdownItem.findMany({
      where: {
        done: true,
        doneAt: { not: null },
        marker: { floor: { projectId: params.id } },
      },
      orderBy: { doneAt: "desc" },
      take: 6,
      select: { id: true, name: true, doneAt: true, doneBy: true },
    }),
  ]);

  if (!project) notFound();

  const { floors } = project;
  let totalItems = 0;
  let doneCount = 0;
  let totalMarkers = 0;
  const lagging: { id: string; label: string; floorName: string; progress: number }[] = [];

  const floorRows = floors.map((f) => {
    let items = 0;
    let done = 0;
    for (const m of f.markers) {
      items += m.items.length;
      done += m.items.filter((i) => i.done).length;
      if (m.items.length > 0) {
        const progress = calcMarkerProgress(m.items);
        if (progress < 100) {
          lagging.push({ id: m.id, label: m.label, floorName: f.name, progress });
        }
      }
    }
    totalItems += items;
    doneCount += done;
    totalMarkers += f.markers.length;
    return {
      id: f.id,
      name: f.name,
      progress: calcFloorProgress(f.markers),
      markers: f.markers.length,
      items,
      done,
    };
  });

  lagging.sort((a, b) => a.progress - b.progress);

  return (
    <ProjectSummary
      projectId={project.id}
      status={project.status}
      createdAt={project.createdAt}
      overall={calcProjectProgress(floors)}
      totalMarkers={totalMarkers}
      totalItems={totalItems}
      doneCount={doneCount}
      floorRows={floorRows}
      laggingMarkers={lagging.slice(0, 6)}
      recentDone={recentDone}
    />
  );
}

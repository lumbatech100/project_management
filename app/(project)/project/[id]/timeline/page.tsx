import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTimeline } from "@/lib/utils";
import { TimelineView } from "@/components/project/timeline/TimelineView";
import { hasMenu } from "@/lib/menus";

export default async function TimelinePage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await getSession();
  if (!hasMenu(session?.user?.menus, "project.timeline")) notFound();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      floors: {
        orderBy: { createdAt: "asc" },
        include: {
          markers: {
            select: {
              items: {
                select: {
                  bobot: true,
                  done: true,
                  progressPct: true,
                  status: true,
                  approvedAt: true,
                  doneAt: true,
                  submittedAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!project) notFound();

  return (
    <TimelineView
      projectId={project.id}
      timelinePdfUrl={project.timelinePdfUrl}
      floors={project.floors}
      canManage={canManageTimeline(session!.user.role, session!.user.menus)}
    />
  );
}

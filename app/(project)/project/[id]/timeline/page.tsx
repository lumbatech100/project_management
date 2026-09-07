import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageDrawing } from "@/lib/utils";
import { TimelineView } from "@/components/project/timeline/TimelineView";

export default async function TimelinePage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      floors: {
        orderBy: { createdAt: "asc" },
        include: {
          markers: {
            include: { items: true },
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
      canManage={canManageDrawing(session!.user.role)}
    />
  );
}

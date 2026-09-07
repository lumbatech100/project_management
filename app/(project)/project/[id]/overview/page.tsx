import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProjectSummary } from "@/components/project/ProjectSummary";

export default async function ProjectOverviewPage({
  params,
}: {
  params: { id: string };
}) {
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
    <ProjectSummary
      projectId={project.id}
      status={project.status}
      createdAt={project.createdAt}
      floors={project.floors}
    />
  );
}

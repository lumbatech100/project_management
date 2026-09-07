import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCreateProject, calcProjectProgress } from "@/lib/utils";
import { ProjectList } from "@/components/project/ProjectList";

export default async function ProjectPage() {
  const session = await getSession();

  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      floors: {
        include: {
          markers: {
            include: { items: true },
          },
        },
      },
    },
  });

  const data = projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    progress: calcProjectProgress(p.floors),
    floorCount: p.floors.length,
  }));

  return (
    <ProjectList
      projects={data}
      canCreate={canCreateProject(session!.user.role)}
    />
  );
}

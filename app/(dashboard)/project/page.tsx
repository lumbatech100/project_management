import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCreateProject } from "@/lib/utils";
import { getProjectsProgress } from "@/lib/project-progress";
import { projectListWhere } from "@/lib/project-access";
import { ProjectList } from "@/components/project/ProjectList";

export default async function ProjectPage() {
  const session = await getSession();
  const user = session!.user;

  const projects = await prisma.project.findMany({
    where: projectListWhere(user.id, user.role),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      _count: { select: { floors: true } },
    },
  });
  const progressMap = await getProjectsProgress(projects.map((p) => p.id));

  const data = projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    progress: progressMap.get(p.id) ?? 0,
    floorCount: p._count.floors,
  }));

  return (
    <ProjectList
      projects={data}
      canCreate={canCreateProject(user.role, user.menus)}
    />
  );
}

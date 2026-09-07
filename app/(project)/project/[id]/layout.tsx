import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcProjectProgress } from "@/lib/utils";
import { normalizeMenus } from "@/lib/menus";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { Navbar } from "@/components/layout/Navbar";
import { AppShell } from "@/components/layout/AppShell";

export default async function ProjectDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const session = await getSession();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      floors: {
        include: {
          markers: { include: { items: true } },
        },
      },
    },
  });

  if (!project) notFound();

  const progress = calcProjectProgress(project.floors);
  const menus = session?.user?.menus?.length
    ? session.user.menus
    : normalizeMenus([], session?.user?.role);

  return (
    <AppShell
      sidebar={
        <ProjectSidebar
          projectId={project.id}
          projectName={project.name}
          progress={progress}
          menus={menus}
        />
      }
    >
      <Navbar />
      <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
        {children}
      </main>
    </AppShell>
  );
}

import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProjectProgress } from "@/lib/project-progress";
import { normalizeMenus } from "@/lib/menus";
import { canAccessProject } from "@/lib/project-access";
import { getAttendanceAccess, hasAttendanceAccess } from "@/lib/attendance";
import { lowStockItems } from "@/lib/inventory";
import { unreadBlockerCount } from "@/lib/blocker";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { Navbar } from "@/components/layout/Navbar";
import { AppShell } from "@/components/layout/AppShell";

export default async function ProjectDetailLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;

  const {
    children
  } = props;

  const session = await getSession();
  if (!session?.user) redirect("/login");

  const allowed = await canAccessProject(
    session.user.id,
    session.user.role,
    params.id
  );
  if (!allowed) redirect("/project");

  const [project, progress] = await Promise.all([
    prisma.project.findUnique({
      where: { id: params.id },
      select: { id: true, name: true },
    }),
    getProjectProgress(params.id),
  ]);

  if (!project) notFound();

  let menus = session.user.menus?.length
    ? session.user.menus
    : normalizeMenus([], session.user.role);
  if (!menus.includes("project.absen")) {
    const absen = await getAttendanceAccess(
      { ...session.user, menus },
      params.id
    );
    if (hasAttendanceAccess(absen)) menus = [...menus, "project.absen"];
  }
  const badges: Record<string, number> = {};
  if (menus.includes("project.inventory")) {
    const low = await lowStockItems(params.id);
    if (low.length > 0) badges["inventory/stok"] = low.length;
  }
  if (menus.includes("project.blocker")) {
    const unread = await unreadBlockerCount(params.id, session.user.id);
    if (unread > 0) badges.blocker = unread;
  }

  return (
    <AppShell
      sidebar={
        <ProjectSidebar
          projectId={project.id}
          projectName={project.name}
          progress={progress}
          menus={menus}
          badges={badges}
        />
      }
    >
      <Navbar />
      <main className="min-h-0 flex-1 overflow-y-auto p-3 print:overflow-visible print:p-0 sm:p-4 lg:p-6">
        {children}
      </main>
    </AppShell>
  );
}

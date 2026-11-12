import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCreateProject } from "@/lib/utils";
import { canManageProjectMembers } from "@/lib/project-access";
import { fileSizeBytes } from "@/lib/storage";
import { ProjectDetailsView } from "@/components/project/ProjectDetailsView";
import { hasMenu } from "@/lib/menus";

export default async function ProjectDetailsPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await getSession();
  if (!hasMenu(session?.user?.menus, "project.details")) notFound();
  const canMembers = canManageProjectMembers(session!.user.role, session!.user.menus);

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      floors: { select: { id: true, drawingUrl: true } },
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      },
    },
  });

  if (!project) notFound();

  const [markerCount, itemCount] = await Promise.all([
    prisma.marker.count({ where: { floor: { projectId: params.id } } }),
    prisma.breakdownItem.count({
      where: { marker: { floor: { projectId: params.id } } },
    }),
  ]);
  const drawings = project.floors.filter((f) => f.drawingUrl).length;
  const drawingBytes = project.floors.reduce(
    (sum, f) => sum + fileSizeBytes(f.drawingUrl),
    0
  );
  const timelineBytes = fileSizeBytes(project.timelinePdfUrl);

  const members = canMembers
    ? project.members.map((m) => ({
        id: m.id,
        role: m.role,
        user: m.user,
      }))
    : [];

  const memberIds = new Set(members.map((m) => m.user.id));
  const candidates = canMembers
    ? (
        await prisma.user.findMany({
          where: { role: { not: "ADMIN" } },
          select: { id: true, name: true, email: true, role: true },
          orderBy: { name: "asc" },
        })
      ).filter((u) => !memberIds.has(u.id))
    : [];

  const orgPeople = await prisma.orgPerson.findMany({
    where: { projectId: params.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <ProjectDetailsView
      project={{
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        createdAt: project.createdAt,
        timelinePdfUrl: project.timelinePdfUrl,
      }}
      stats={{
        floors: project.floors.length,
        markers: markerCount,
        items: itemCount,
        drawings,
        hasTimelinePdf: !!project.timelinePdfUrl,
        storageBytes: drawingBytes + timelineBytes,
        drawingBytes,
        timelineBytes,
      }}
      mailSettings={{
        smtpHost: project.smtpHost || "",
        smtpPort: project.smtpPort ?? 587,
        smtpSecure: project.smtpSecure,
        smtpUser: project.smtpUser || "",
        smtpPassSet: !!project.smtpPass,
        mailFrom: project.mailFrom || "",
        mailFromName: project.mailFromName || "",
        mailSenders: (() => {
          const raw = project.mailSenders;
          if (Array.isArray(raw) && raw.length > 0) {
            return raw
              .map((s) => {
                if (!s || typeof s !== "object") return null;
                const email =
                  "email" in s && typeof s.email === "string"
                    ? s.email
                    : "";
                const name =
                  "name" in s && typeof s.name === "string" ? s.name : "";
                if (!email) return null;
                return { email, name };
              })
              .filter((s): s is { email: string; name: string } => !!s);
          }
          if (project.mailFrom) {
            return [
              {
                email: project.mailFrom,
                name: project.mailFromName || "",
              },
            ];
          }
          return [];
        })(),
        mailTo: project.mailTo || [],
        mailCc: project.mailCc || [],
      }}
      canManage={canCreateProject(session!.user.role, session!.user.menus)}
      canManageMembers={canMembers}
      initialMembers={members}
      initialCandidates={candidates}
      initialOrgPeople={orgPeople}
    />
  );
}

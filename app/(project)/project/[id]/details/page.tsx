import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCreateProject } from "@/lib/utils";
import { fileSizeBytes } from "@/lib/storage";
import { ProjectDetailsView } from "@/components/project/ProjectDetailsView";

export default async function ProjectDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
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

  if (!project) notFound();

  const markers = project.floors.flatMap((f) => f.markers);
  const items = markers.flatMap((m) => m.items);
  const drawings = project.floors.filter((f) => f.drawingUrl).length;
  const drawingBytes = project.floors.reduce(
    (sum, f) => sum + fileSizeBytes(f.drawingUrl),
    0
  );
  const timelineBytes = fileSizeBytes(project.timelinePdfUrl);

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
        markers: markers.length,
        items: items.length,
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
        mailTo: project.mailTo || [],
        mailCc: project.mailCc || [],
      }}
      canManage={canCreateProject(session!.user.role)}
    />
  );
}

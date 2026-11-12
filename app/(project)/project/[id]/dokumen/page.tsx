import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasMenu } from "@/lib/menus";
import { prisma } from "@/lib/prisma";
import { canManageDocuments } from "@/lib/utils";
import { DokumenView } from "@/components/project/DokumenView";

export default async function DokumenPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await getSession();
  if (!hasMenu(session?.user?.menus, "project.dokumen")) {
    notFound();
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) notFound();

  const documents = await prisma.projectDocument.findMany({
    where: { projectId: params.id },
    orderBy: [{ category: "asc" }, { createdAt: "desc" }],
  });

  return (
    <DokumenView
      projectId={params.id}
      documents={documents}
      canManage={canManageDocuments(session!.user.role, session!.user.menus)}
    />
  );
}

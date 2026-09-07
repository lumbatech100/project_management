import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageWorkers } from "@/lib/utils";
import { PekerjaView } from "@/components/project/PekerjaView";
import { notFound } from "next/navigation";

export default async function PekerjaPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) notFound();

  const workers = await prisma.worker.findMany({
    where: { projectId: params.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <PekerjaView
      projectId={params.id}
      workers={workers}
      canManage={canManageWorkers(session!.user.role)}
    />
  );
}

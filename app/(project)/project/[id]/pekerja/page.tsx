import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageWorkers } from "@/lib/utils";
import { ensureDefaultWorkerGroups } from "@/lib/worker-groups";
import { PekerjaView } from "@/components/project/PekerjaView";
import { notFound } from "next/navigation";
import { hasMenu } from "@/lib/menus";
import { projectStaffUsers } from "@/lib/attendance";

export default async function PekerjaPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await getSession();
  if (!hasMenu(session?.user?.menus, "project.pekerja")) notFound();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) notFound();

  const [groups, staffUsers] = await Promise.all([
    ensureDefaultWorkerGroups(params.id),
    projectStaffUsers(params.id),
  ]);

  const workers = await prisma.worker.findMany({
    where: { projectId: params.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      group: { select: { id: true, name: true, kind: true } },
    },
  });

  return (
    <PekerjaView
      projectId={params.id}
      workers={workers.map((w) => ({
        ...w,
        photoKtpUrl: w.photoKtpUrl,
        photoSelfieUrl: w.photoSelfieUrl,
      }))}
      groups={groups}
      staffUsers={staffUsers}
      canManage={canManageWorkers(session!.user.role, session!.user.menus)}
    />
  );
}

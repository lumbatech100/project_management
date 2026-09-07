import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canApproveProgress, canManageDailyReport, canSubmitProgress } from "@/lib/utils";
import { hasMenu } from "@/lib/menus";
import { DailyReportView } from "@/components/project/DailyReportView";

export default async function LaporanHarianPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  const menus = session?.user?.menus || [];

  if (!session?.user || !hasMenu(menus, "project.laporan")) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="font-medium text-slate-700">Akses ditolak</p>
        <p className="mt-1 text-sm text-slate-500">
          Anda tidak punya privilege menu Laporan Harian
        </p>
      </div>
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) notFound();

  return (
    <DailyReportView
      projectId={project.id}
      canManage={canManageDailyReport(session.user.role)}
      canApprove={canApproveProgress(session.user.role)}
      canSend={
        canSubmitProgress(session.user.role) ||
        canManageDailyReport(session.user.role)
      }
    />
  );
}

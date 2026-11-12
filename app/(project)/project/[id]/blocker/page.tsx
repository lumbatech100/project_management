import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasMenu } from "@/lib/menus";
import { BlockerView } from "@/components/project/BlockerView";

export const dynamic = "force-dynamic";

export default async function BlockerPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  const menus = session?.user?.menus || [];

  if (!session?.user || !hasMenu(menus, "project.blocker")) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="font-medium text-slate-700">Akses ditolak</p>
        <p className="mt-1 text-sm text-slate-500">Anda tidak punya privilege menu Blocker</p>
      </div>
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) notFound();

  return (
    <BlockerView
      projectId={project.id}
      isAdmin={session.user.role === "ADMIN"}
      userId={session.user.id}
    />
  );
}

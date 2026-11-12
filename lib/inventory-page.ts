import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasMenu } from "@/lib/menus";
import { prisma } from "@/lib/prisma";
import { canManageInventory, canRecordDelivery } from "@/lib/utils";

/** Guard halaman Inventory: menu + project ada. */
export async function loadInventoryPage(projectId: string) {
  const session = await getSession();
  if (!session?.user || !hasMenu(session.user.menus, "project.inventory")) {
    notFound();
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) notFound();
  return {
    project,
    user: session.user,
    canManage: canManageInventory(session.user.role, session.user.menus),
    canRecord: canRecordDelivery(session.user.role, session.user.menus),
  };
}

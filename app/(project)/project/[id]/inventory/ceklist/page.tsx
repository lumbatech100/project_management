import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasMenu } from "@/lib/menus";
import { prisma } from "@/lib/prisma";
import { canManageInventory, canRecordDelivery } from "@/lib/utils";
import { GoodsChecklistView } from "@/components/project/GoodsChecklistView";
import { receiptInclude } from "@/lib/goods-receipt";
import { formatDateKey, getJakartaTodayDate } from "@/lib/workday";

export default async function GoodsChecklistPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await getSession();
  if (!hasMenu(session?.user?.menus, "project.inventory")) {
    notFound();
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) notFound();

  const receiptsQuery = prisma.goodsReceipt.findMany({
    where: { projectId: params.id },
    include: receiptInclude,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const items = await prisma.goodsChecklistItem.findMany({
    where: { projectId: params.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      unit: true,
      qty: true,
      purchasedQty: true,
      arrivedQty: true,
      purchasedAt: true,
      purchasedBy: true,
      arrivedAt: true,
      arrivedBy: true,
      notes: true,
    },
  });

  const receipts = await receiptsQuery;

  return (
    <GoodsChecklistView
      projectId={params.id}
      items={items}
      receipts={receipts}
      today={formatDateKey(getJakartaTodayDate())}
      canManage={canManageInventory(session!.user.role, session!.user.menus)}
      canRecord={canRecordDelivery(session!.user.role, session!.user.menus)}
    />
  );
}

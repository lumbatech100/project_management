import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessMenu, forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageInventory } from "@/lib/utils";
import { recomputeArrived } from "@/lib/goods-receipt";
import { deleteUploadByUrl } from "@/lib/storage";

type Params = { params: Promise<{ id: string; receiptId: string }> };

export async function DELETE(req: NextRequest, props: Params) {
  const params = await props.params;
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await forbidUnlessProjectAccess(
    session.user.id,
    session.user.role,
    params.id
  );
  if (denied) return denied;
  const noMenu = forbidUnlessMenu(session.user, "project.inventory");
  if (noMenu) return noMenu;
  if (!canManageInventory(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const receipt = await prisma.goodsReceipt.findFirst({
    where: { id: params.receiptId, projectId: params.id },
    select: { id: true, attachmentUrls: true, lines: { select: { itemId: true } } },
  });
  if (!receipt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const itemIds = [...new Set(receipt.lines.map((l) => l.itemId))];
  const who = session.user.name || session.user.email || "User";
  await prisma.$transaction(async (tx) => {
    await tx.goodsReceipt.delete({ where: { id: receipt.id } });
    await recomputeArrived(tx, itemIds, who);
  });
  await Promise.all(receipt.attachmentUrls.map((u) => deleteUploadByUrl(u)));

  const items = await prisma.goodsChecklistItem.findMany({
    where: { id: { in: itemIds } },
  });
  return NextResponse.json({ ok: true, items });
}

import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canUpdatePoProgress } from "@/lib/utils";
import { deleteUploadByUrl } from "@/lib/storage";
import { calcPoProgress, sumBobot } from "@/lib/po-progress";
import { applyFieldProgress } from "@/lib/po-field-progress";

type Params = {
  params: Promise<{ id: string; poId: string; lineId: string; deliveryId: string }>;
};

const lineInclude = {
  deliveries: { orderBy: [{ date: "desc" as const }, { createdAt: "desc" as const }] },
};

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
  if (!canUpdatePoProgress(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const delivery = await prisma.poDelivery.findFirst({
    where: {
      id: params.deliveryId,
      lineId: params.lineId,
      line: { poId: params.poId, po: { projectId: params.id } },
    },
  });
  if (!delivery) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (delivery.deliveryNoteLineId) {
    return NextResponse.json(
      {
        error: `Tercatat dari Inventory (SJ ${delivery.suratJalan ?? ""}). Batalkan lewat Inventory › Barang masuk.`,
      },
      { status: 409 }
    );
  }

  for (const url of delivery.photoUrls || []) {
    await deleteUploadByUrl(url);
  }
  await prisma.poDelivery.delete({ where: { id: delivery.id } });

  const loaded = await prisma.purchaseOrder.findFirst({
    where: { id: params.poId, projectId: params.id },
    include: {
      lines: {
        include: lineInclude,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  const [updated] = await applyFieldProgress(params.id, [loaded!]);

  return NextResponse.json({
    ...updated!,
    progressPct: calcPoProgress(updated!.lines),
    bobotTotal: sumBobot(updated!.lines),
  });
}

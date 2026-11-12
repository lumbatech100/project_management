import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasMenu } from "@/lib/menus";
import { prisma } from "@/lib/prisma";
import { canManagePo, canUpdatePoProgress } from "@/lib/utils";
import { calcPoProgress, sumBobot } from "@/lib/po-progress";
import { applyFieldProgress } from "@/lib/po-field-progress";
import {
  ProgressPoView,
  type PurchaseOrderRow,
} from "@/components/project/ProgressPoView";

export default async function ProgressPoPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await getSession();
  if (!hasMenu(session?.user?.menus, "project.po")) {
    notFound();
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const loaded = await prisma.purchaseOrder.findMany({
    where: { projectId: params.id },
    include: {
      lines: {
        include: {
          deliveries: {
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });
  const raw = await applyFieldProgress(params.id, loaded);

  const initialPos: PurchaseOrderRow[] = raw.map((po) => ({
    id: po.id,
    number: po.number,
    title: po.title,
    totalValue: po.totalValue,
    notes: po.notes,
    progressPct: calcPoProgress(po.lines),
    bobotTotal: sumBobot(po.lines),
    createdAt: po.createdAt,
    lines: po.lines.map((l) => ({
      id: l.id,
      name: l.name,
      code: l.code,
      groupName: l.groupName,
      type: l.type,
      qty: l.qty,
      unit: l.unit,
      unitPrice: l.unitPrice,
      amount: l.amount,
      bobotPct: l.bobotPct,
      bobotUnitPct: l.bobotUnitPct,
      progressPct: l.progressPct,
      notes: l.notes,
      sortOrder: l.sortOrder,
      deliveries: l.deliveries.map((d) => ({
        id: d.id,
        date: d.date,
        qty: d.qty,
        suratJalan: d.suratJalan,
        notes: d.notes,
        photoUrls: d.photoUrls,
        createdBy: d.createdBy,
        createdAt: d.createdAt,
      })),
    })),
  }));

  return (
    <ProgressPoView
      projectId={params.id}
      projectName={project.name}
      initialPos={initialPos}
      canManage={canManagePo(session!.user.role, session!.user.menus)}
      canUpdate={canUpdatePoProgress(session!.user.role, session!.user.menus)}
    />
  );
}

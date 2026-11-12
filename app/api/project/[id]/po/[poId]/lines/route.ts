import { NextRequest, NextResponse } from "next/server";
import type { PoLineType } from "@prisma/client";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManagePo } from "@/lib/utils";
import { PO_LINE_TYPES } from "@/lib/po-types";
import { calcPoProgress, sumBobot, parseBobotUnitPct } from "@/lib/po-progress";
import { applyFieldProgress } from "@/lib/po-field-progress";

type Params = { params: Promise<{ id: string; poId: string }> };

const lineInclude = {
  deliveries: { orderBy: [{ date: "desc" as const }, { createdAt: "desc" as const }] },
};

function isPoLineType(v: unknown): v is PoLineType {
  return typeof v === "string" && (PO_LINE_TYPES as string[]).includes(v);
}

async function loadPo(projectId: string, poId: string) {
  return prisma.purchaseOrder.findFirst({
    where: { id: poId, projectId },
    include: {
      lines: {
        include: lineInclude,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
}

export async function POST(req: NextRequest, props: Params) {
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
  if (!canManagePo(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const po = await loadPo(params.id, params.poId);
  if (!po) {
    return NextResponse.json({ error: "PO tidak ditemukan" }, { status: 404 });
  }

  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Nama line wajib" }, { status: 400 });
  }

  const type: PoLineType = isPoLineType(body.type) ? body.type : "BARANG";
  const qty = parseFloat(body.qty ?? "1");
  const bobotPct = parseFloat(body.bobotPct ?? "0");
  const unit = String(body.unit || "Unit").trim() || "Unit";
  const code =
    typeof body.code === "string" ? body.code.trim() || null : null;
  const groupName =
    typeof body.groupName === "string" ? body.groupName.trim() || null : null;
  const notes =
    typeof body.notes === "string" ? body.notes.trim() || null : null;
  const sortOrder =
    body.sortOrder !== undefined
      ? parseInt(String(body.sortOrder), 10)
      : po.lines.length;

  let unitPrice: number | null = null;
  if (body.unitPrice !== undefined && body.unitPrice !== null && body.unitPrice !== "") {
    unitPrice = parseFloat(body.unitPrice);
    if (Number.isNaN(unitPrice) || unitPrice < 0) {
      return NextResponse.json({ error: "Harga satuan tidak valid" }, { status: 400 });
    }
  }
  let amount: number | null = null;
  if (body.amount !== undefined && body.amount !== null && body.amount !== "") {
    amount = parseFloat(body.amount);
    if (Number.isNaN(amount) || amount < 0) {
      return NextResponse.json({ error: "Nilai line tidak valid" }, { status: 400 });
    }
  } else if (unitPrice != null && !Number.isNaN(qty)) {
    amount = unitPrice * qty;
  }

  if (Number.isNaN(qty) || qty < 0) {
    return NextResponse.json({ error: "Qty tidak valid" }, { status: 400 });
  }
  if (Number.isNaN(bobotPct) || bobotPct < 0) {
    return NextResponse.json({ error: "Bobot tidak valid" }, { status: 400 });
  }

  let bobotUnitPct: number | null = null;
  try {
    bobotUnitPct = parseBobotUnitPct(body.bobotUnitPct, bobotPct, qty);
  } catch {
    return NextResponse.json(
      { error: "Bobot per unit tidak valid" },
      { status: 400 }
    );
  }

  let progressPct = 0;
  if (type !== "BARANG" && body.progressPct !== undefined) {
    progressPct = Math.min(100, Math.max(0, parseFloat(body.progressPct) || 0));
  }

  await prisma.poLine.create({
    data: {
      poId: po.id,
      name,
      code,
      groupName,
      type,
      qty,
      unit,
      unitPrice,
      amount,
      bobotPct,
      bobotUnitPct,
      sortOrder: Number.isNaN(sortOrder) ? po.lines.length : sortOrder,
      progressPct,
      notes,
    },
  });

  const [updated] = await applyFieldProgress(params.id, [
    (await loadPo(params.id, params.poId))!,
  ]);
  return NextResponse.json(
    {
      ...updated!,
      progressPct: calcPoProgress(updated!.lines),
      bobotTotal: sumBobot(updated!.lines),
    },
    { status: 201 }
  );
}

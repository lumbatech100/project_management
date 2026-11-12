import { NextRequest, NextResponse } from "next/server";
import { getApiSession, type ApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, forbidUnlessMenu } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageInventory, canRecordDelivery } from "@/lib/utils";
import {
  GOODS_NAME_MAX,
  GOODS_NOTES_MAX,
  GOODS_UNIT_MAX,
  completionStamp,
  parseQty,
  parseText,
} from "@/lib/goods-checklist";
import { deleteEmptyReceipts } from "@/lib/goods-receipt";

type Params = { params: Promise<{ id: string; itemId: string }> };

async function guard(
  req: NextRequest,
  projectId: string
): Promise<{ error: NextResponse } | { session: ApiSession }> {
  const session = await getApiSession(req);
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const denied = await forbidUnlessProjectAccess(
    session.user.id,
    session.user.role,
    projectId
  );
  if (denied) return { error: denied };
  const noMenu = forbidUnlessMenu(session.user, "project.inventory");
  if (noMenu) return { error: noMenu };
  return { session };
}

export async function PATCH(req: NextRequest, props: Params) {
  const params = await props.params;
  const g = await guard(req, params.id);
  if (!("session" in g)) return g.error;
  const { user } = g.session;

  const existing = await prisma.goodsChecklistItem.findFirst({
    where: { id: params.itemId, projectId: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.arrivedQty !== undefined) {
    return NextResponse.json(
      { error: "Kedatangan barang dicatat lewat surat jalan" },
      { status: 400 }
    );
  }
  const editsMaster = ["name", "unit", "qty", "notes"].some(
    (k) => body[k] !== undefined
  );
  const editsProgress = body.purchasedQty !== undefined;

  if (editsMaster && !canManageInventory(user.role, user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (editsProgress && !canRecordDelivery(user.role, user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: {
    name?: string;
    unit?: string;
    qty?: number;
    notes?: string | null;
    purchasedQty?: number;
  } = {};

  if (body.name !== undefined) {
    const name = parseText(body.name, GOODS_NAME_MAX);
    if (!name) {
      return NextResponse.json(
        { error: `Nama barang wajib (maks ${GOODS_NAME_MAX} karakter)` },
        { status: 400 }
      );
    }
    data.name = name;
  }
  if (body.unit !== undefined) {
    const unit = parseText(body.unit, GOODS_UNIT_MAX);
    if (!unit) {
      return NextResponse.json({ error: "Satuan tidak valid" }, { status: 400 });
    }
    data.unit = unit;
  }
  if (body.qty !== undefined) {
    const qty = parseQty(body.qty, true);
    if (qty == null) {
      return NextResponse.json(
        { error: "Qty kebutuhan harus lebih dari 0" },
        { status: 400 }
      );
    }
    data.qty = qty;
  }
  if (body.notes !== undefined) {
    const notes = parseText(body.notes, GOODS_NOTES_MAX);
    if (notes === undefined) {
      return NextResponse.json(
        { error: `Catatan maks ${GOODS_NOTES_MAX} karakter` },
        { status: 400 }
      );
    }
    data.notes = notes;
  }
  if (body.purchasedQty !== undefined) {
    const v = parseQty(body.purchasedQty);
    if (v == null) {
      return NextResponse.json({ error: "Qty tidak valid" }, { status: 400 });
    }
    if (v < existing.arrivedQty) {
      return NextResponse.json(
        {
          error: `Qty dibeli tidak boleh kurang dari qty yang sudah sampai (${existing.arrivedQty.toLocaleString("id-ID")} ${existing.unit})`,
        },
        { status: 400 }
      );
    }
    data.purchasedQty = v;
  }
  if (data.qty !== undefined && data.qty < existing.arrivedQty) {
    return NextResponse.json(
      {
        error: `Qty kebutuhan tidak boleh kurang dari qty yang sudah sampai (${existing.arrivedQty.toLocaleString("id-ID")} ${existing.unit})`,
      },
      { status: 400 }
    );
  }

  if (!editsMaster && !editsProgress) {
    return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 });
  }

  const who = user.name || user.email || "User";
  const qty = data.qty ?? existing.qty;
  const purchased = completionStamp(
    data.purchasedQty ?? existing.purchasedQty,
    qty,
    existing.purchasedAt,
    existing.purchasedBy,
    who
  );
  const arrived = completionStamp(
    existing.arrivedQty,
    qty,
    existing.arrivedAt,
    existing.arrivedBy,
    who
  );

  const item = await prisma.goodsChecklistItem.update({
    where: { id: existing.id },
    data: {
      ...data,
      purchasedAt: purchased.at,
      purchasedBy: purchased.by,
      arrivedAt: arrived.at,
      arrivedBy: arrived.by,
    },
  });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest, props: Params) {
  const params = await props.params;
  const g = await guard(req, params.id);
  if (!("session" in g)) return g.error;
  const { user } = g.session;
  if (!canManageInventory(user.role, user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.goodsChecklistItem.findFirst({
    where: { id: params.itemId, projectId: params.id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.goodsChecklistItem.delete({ where: { id: existing.id } });
  await deleteEmptyReceipts(params.id);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessMenu, forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canRecordDelivery } from "@/lib/utils";
import {
  GOODS_NAME_MAX,
  GOODS_NOTES_MAX,
  GOODS_UNIT_MAX,
  parseQty,
  parseText,
} from "@/lib/goods-checklist";
import { parseDateKey } from "@/lib/workday";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, props: Params) {
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

  const requests = await prisma.itemRequest.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ requests });
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
  if (!canRecordDelivery(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const qty = parseQty(body.qty, true);
  if (qty == null) {
    return NextResponse.json({ error: "Qty harus lebih dari 0" }, { status: 400 });
  }

  let name: string | null | undefined;
  let unit: string | null | undefined;
  let itemId: string | null = null;
  if (typeof body.itemId === "string" && body.itemId) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: body.itemId, projectId: params.id },
      select: { id: true, name: true, unit: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Barang tidak ditemukan" }, { status: 404 });
    }
    itemId = item.id;
    name = item.name;
    unit = item.unit;
  } else {
    name = parseText(body.name, GOODS_NAME_MAX);
    unit = parseText(body.unit, GOODS_UNIT_MAX);
  }
  if (!name) {
    return NextResponse.json({ error: "Nama barang wajib" }, { status: 400 });
  }

  const notes = parseText(body.notes, GOODS_NOTES_MAX);
  if (notes === undefined && body.notes != null) {
    return NextResponse.json(
      { error: `Catatan maks ${GOODS_NOTES_MAX} karakter` },
      { status: 400 }
    );
  }

  let neededBy: Date | null = null;
  if (typeof body.neededBy === "string" && body.neededBy) {
    neededBy = parseDateKey(body.neededBy.slice(0, 10));
    if (!neededBy) {
      return NextResponse.json({ error: "Tanggal dibutuhkan tidak valid" }, { status: 400 });
    }
  }

  const request = await prisma.itemRequest.create({
    data: {
      projectId: params.id,
      itemId,
      name,
      unit: unit || "pcs",
      qty,
      neededBy,
      notes: notes ?? null,
      requestedBy: session.user.name || session.user.email || "User",
      requestedById: session.user.id,
    },
  });
  return NextResponse.json(request, { status: 201 });
}

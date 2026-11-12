import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, forbidUnlessMenu } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageInventory } from "@/lib/utils";
import {
  GOODS_NAME_MAX,
  GOODS_NOTES_MAX,
  GOODS_UNIT_MAX,
  parseQty,
  parseText,
} from "@/lib/goods-checklist";

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

  const items = await prisma.goodsChecklistItem.findMany({
    where: { projectId: params.id },
    orderBy: [{ name: "asc" }],
  });
  return NextResponse.json({ items });
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
  const noMenu = forbidUnlessMenu(session.user, "project.inventory");
  if (noMenu) return noMenu;
  if (!canManageInventory(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const name = parseText(body.name, GOODS_NAME_MAX);
  if (!name) {
    return NextResponse.json(
      { error: `Nama barang wajib (maks ${GOODS_NAME_MAX} karakter)` },
      { status: 400 }
    );
  }
  const unit = parseText(body.unit, GOODS_UNIT_MAX);
  if (unit === undefined && body.unit !== undefined) {
    return NextResponse.json({ error: "Satuan tidak valid" }, { status: 400 });
  }
  const qty = parseQty(body.qty, true);
  if (qty == null) {
    return NextResponse.json(
      { error: "Qty kebutuhan harus lebih dari 0" },
      { status: 400 }
    );
  }
  const notes = parseText(body.notes, GOODS_NOTES_MAX);
  if (notes === undefined && body.notes !== undefined) {
    return NextResponse.json(
      { error: `Catatan maks ${GOODS_NOTES_MAX} karakter` },
      { status: 400 }
    );
  }

  const item = await prisma.goodsChecklistItem.create({
    data: {
      projectId: params.id,
      name,
      unit: unit || "pcs",
      qty,
      notes: notes ?? null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}

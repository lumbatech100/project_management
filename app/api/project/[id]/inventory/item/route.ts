import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, forbidUnlessMenu } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageInventory } from "@/lib/utils";

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

  const items = await prisma.inventoryItem.findMany({
    where: { projectId: params.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
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

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Nama barang wajib" }, { status: 400 });
  }

  const unit =
    typeof body.unit === "string" && body.unit.trim()
      ? body.unit.trim()
      : "pcs";
  const qty = Number(body.qty);
  const minQty =
    body.minQty === "" || body.minQty == null ? null : Number(body.minQty);

  const { _max } = await prisma.inventoryItem.aggregate({
    where: { projectId: params.id },
    _max: { sortOrder: true },
  });
  const item = await prisma.inventoryItem.create({
    data: {
      projectId: params.id,
      category: "SUPPORT",
      name,
      code:
        typeof body.code === "string" ? body.code.trim() || null : null,
      unit,
      qty: Number.isFinite(qty) ? Math.max(0, qty) : 0,
      minQty: minQty != null && Number.isFinite(minQty) ? minQty : null,
      location:
        typeof body.location === "string" && body.location.trim()
          ? body.location.trim()
          : "Gudang Utama",
      notes:
        typeof body.notes === "string" ? body.notes.trim() || null : null,
      sortOrder: (_max.sortOrder ?? 0) + 1,
    },
  });

  return NextResponse.json(item, { status: 201 });
}

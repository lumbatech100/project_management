import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageInventory } from "@/lib/utils";

type Params = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(req: NextRequest, props: Params) {
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

  const existing = await prisma.inventoryItem.findFirst({
    where: { id: params.itemId, projectId: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim()) {
    data.name = body.name.trim();
  }
  if (body.code !== undefined) {
    data.code =
      typeof body.code === "string" ? body.code.trim() || null : null;
  }
  if (typeof body.unit === "string" && body.unit.trim()) {
    data.unit = body.unit.trim();
  }
  if (body.qty !== undefined) {
    const qty = Number(body.qty);
    if (!Number.isFinite(qty) || qty < 0) {
      return NextResponse.json({ error: "Qty tidak valid" }, { status: 400 });
    }
    data.qty = qty;
  }
  if (body.minQty !== undefined) {
    if (body.minQty === "" || body.minQty == null) data.minQty = null;
    else {
      const minQty = Number(body.minQty);
      data.minQty = Number.isFinite(minQty) ? minQty : null;
    }
  }
  if (body.location !== undefined) {
    data.location =
      typeof body.location === "string"
        ? body.location.trim() || null
        : null;
  }
  if (body.notes !== undefined) {
    data.notes =
      typeof body.notes === "string" ? body.notes.trim() || null : null;
  }

  const item = await prisma.inventoryItem.update({
    where: { id: existing.id },
    data,
  });
  return NextResponse.json(item);
}

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
  if (!canManageInventory(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.inventoryItem.findFirst({
    where: { id: params.itemId, projectId: params.id },
    include: { _count: { select: { lines: true, poLines: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing._count.poLines > 0) {
    return NextResponse.json(
      { error: "Barang dari list PO tidak bisa dihapus. Ubah lewat Progress Kumulatif." },
      { status: 409 }
    );
  }
  if (existing._count.lines > 0) {
    return NextResponse.json(
      {
        error:
          "Barang sudah dipakai di surat jalan. Hapus/batalkan surat jalan terkait dulu, atau nonaktifkan lewat edit.",
      },
      { status: 409 }
    );
  }

  await prisma.inventoryItem.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}

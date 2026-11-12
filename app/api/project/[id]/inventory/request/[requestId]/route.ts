import { NextRequest, NextResponse } from "next/server";
import type { ItemRequestStatus } from "@prisma/client";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageInventory } from "@/lib/utils";
import { GOODS_NOTES_MAX, parseText } from "@/lib/goods-checklist";

type Params = { params: Promise<{ id: string; requestId: string }> };

const NEXT_STATUS: Record<ItemRequestStatus, ItemRequestStatus[]> = {
  REQUESTED: ["PURCHASING", "DONE", "REJECTED"],
  PURCHASING: ["DONE", "REJECTED"],
  DONE: [],
  REJECTED: [],
};

/** Gudang memproses permintaan: PURCHASING (sedang dibeli) / DONE / REJECTED */
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

  const existing = await prisma.itemRequest.findFirst({
    where: { id: params.requestId, projectId: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const status = body.status as ItemRequestStatus;
  if (!NEXT_STATUS[existing.status].includes(status)) {
    return NextResponse.json({ error: "Perubahan status tidak valid" }, { status: 400 });
  }
  const handlerNote = parseText(body.handlerNote, GOODS_NOTES_MAX);
  if (handlerNote === undefined && body.handlerNote != null) {
    return NextResponse.json(
      { error: `Catatan maks ${GOODS_NOTES_MAX} karakter` },
      { status: 400 }
    );
  }

  const updated = await prisma.itemRequest.update({
    where: { id: existing.id },
    data: {
      status,
      handledBy: session.user.name || session.user.email || "User",
      handledAt: new Date(),
      ...(handlerNote !== undefined ? { handlerNote } : {}),
    },
  });
  return NextResponse.json(updated);
}

/** Hapus permintaan yang belum diproses (oleh pembuat atau gudang). */
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

  const existing = await prisma.itemRequest.findFirst({
    where: { id: params.requestId, projectId: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const isOwner = existing.requestedById === session.user.id;
  if (!isOwner && !canManageInventory(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (existing.status !== "REQUESTED") {
    return NextResponse.json(
      { error: "Permintaan yang sudah diproses tidak bisa dihapus" },
      { status: 409 }
    );
  }

  await prisma.itemRequest.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canApproveProgress, canManageDrawing } from "@/lib/utils";

type Params = { params: { id: string; itemId: string } };

async function findItem(projectId: string, itemId: string) {
  return prisma.breakdownItem.findFirst({
    where: {
      id: itemId,
      marker: { floor: { projectId } },
    },
  });
}

/** Admin/PM: update nama & bobot breakdown */
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageDrawing(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const item = await findItem(params.id, params.itemId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const name =
    typeof body.name === "string" ? body.name.trim() : item.name;
  const bobot =
    body.bobot !== undefined && body.bobot !== null
      ? parseFloat(body.bobot)
      : item.bobot;

  if (!name) {
    return NextResponse.json({ error: "Nama wajib" }, { status: 400 });
  }
  if (Number.isNaN(bobot) || bobot < 0) {
    return NextResponse.json({ error: "Bobot tidak valid" }, { status: 400 });
  }

  const updated = await prisma.breakdownItem.update({
    where: { id: params.itemId },
    data: { name, bobot },
  });

  return NextResponse.json(updated);
}

/** Admin/PM: hapus breakdown item */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageDrawing(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const item = await findItem(params.id, params.itemId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.breakdownItem.delete({ where: { id: params.itemId } });
  return NextResponse.json({ ok: true });
}

/** SM/Admin: approve atau reject item yang sudah di-submit Leader */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const item = await findItem(params.id, params.itemId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const action = body.action as string;
  const who = session.user.name || session.user.email || "Unknown";

  if (action === "approve") {
    if (!canApproveProgress(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (item.status !== "SUBMITTED" && !canManageDrawing(session.user.role)) {
      return NextResponse.json(
        { error: "Item belum di-submit Leader" },
        { status: 400 }
      );
    }
    const now = new Date();
    const updated = await prisma.breakdownItem.update({
      where: { id: params.itemId },
      data: {
        status: "APPROVED",
        done: true,
        doneAt: now,
        doneBy: who,
        approvedAt: now,
        approvedBy: who,
      },
    });
    return NextResponse.json(updated);
  }

  if (action === "reject") {
    if (!canApproveProgress(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (item.status !== "SUBMITTED") {
      return NextResponse.json(
        { error: "Hanya item submitted yang bisa ditolak" },
        { status: 400 }
      );
    }
    const updated = await prisma.breakdownItem.update({
      where: { id: params.itemId },
      data: {
        status: "OPEN",
        done: false,
        doneAt: null,
        doneBy: null,
        submittedAt: null,
        submittedBy: null,
        approvedAt: null,
        approvedBy: null,
      },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json(
    { error: "Action tidak valid (approve|reject)" },
    { status: 400 }
  );
}

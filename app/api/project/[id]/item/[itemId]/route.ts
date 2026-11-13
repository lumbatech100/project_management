import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canApproveProgress, canEditBreakdown } from "@/lib/utils";

type Params = { params: Promise<{ id: string; itemId: string }> };

async function findItem(projectId: string, itemId: string) {
  return prisma.breakdownItem.findFirst({
    where: {
      id: itemId,
      marker: { floor: { projectId } },
    },
  });
}

/** Admin: update nama & bobot breakdown */
export async function PUT(req: NextRequest, props: Params) {
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
  if (!canEditBreakdown(session.user.role, session.user.menus)) {
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

/** Admin: hapus breakdown item */
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
  if (!canEditBreakdown(session.user.role, session.user.menus)) {
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

  const item = await findItem(params.id, params.itemId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const action = body.action as string;
  const who = session.user.name || session.user.email || "Unknown";

  if (action === "approve") {
    if (!canApproveProgress(session.user.role, session.user.menus)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (item.status !== "SUBMITTED" && session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Item belum di-submit Leader" },
        { status: 400 }
      );
    }
    const now = new Date();
    const nextPct =
      item.submittedPct != null && item.submittedPct > item.progressPct
        ? item.submittedPct
        : item.progressPct >= 100
          ? 100
          : item.status === "SUBMITTED"
            ? 100
            : item.progressPct || 100;
    const complete = nextPct >= 100;

    const updated = await prisma.breakdownItem.update({
      where: { id: params.itemId },
      data: {
        progressPct: nextPct,
        submittedPct: null,
        status: complete ? "APPROVED" : "OPEN",
        done: complete,
        doneAt: complete ? now : null,
        doneBy: complete ? who : null,
        approvedAt: now,
        approvedBy: who,
        submittedAt: complete ? item.submittedAt : null,
        submittedBy: complete ? item.submittedBy : null,
      },
    });
    return NextResponse.json(updated);
  }

  if (action === "reject") {
    if (!canApproveProgress(session.user.role, session.user.menus)) {
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
        submittedPct: null,
        done: item.progressPct >= 100,
        doneAt: item.progressPct >= 100 ? item.doneAt : null,
        doneBy: item.progressPct >= 100 ? item.doneBy : null,
        submittedAt: null,
        submittedBy: null,
        // keep progressPct + last approvedAt
      },
    });
    // Batalkan jejak proses hari ini yang belum ter-approve
    if (item.workDate && item.submittedPct != null) {
      await prisma.breakdownProgressLog.deleteMany({
        where: {
          itemId: item.id,
          workDate: item.workDate,
          toPct: item.submittedPct,
        },
      });
    }
    return NextResponse.json(updated);
  }

  return NextResponse.json(
    { error: "Action tidak valid (approve|reject)" },
    { status: 400 }
  );
}

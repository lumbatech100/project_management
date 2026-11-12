import { NextRequest, NextResponse } from "next/server";
import type { PoLineType } from "@prisma/client";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManagePo, canUpdatePoProgress } from "@/lib/utils";
import { PO_LINE_TYPES } from "@/lib/po-types";
import { calcPoProgress, sumBobot, parseBobotUnitPct } from "@/lib/po-progress";
import {
  applyFieldProgress,
  isFieldProgressLine,
} from "@/lib/po-field-progress";

type Params = { params: Promise<{ id: string; poId: string; lineId: string }> };

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

async function findLine(projectId: string, poId: string, lineId: string) {
  return prisma.poLine.findFirst({
    where: {
      id: lineId,
      poId,
      po: { projectId },
    },
  });
}

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

  const line = await findLine(params.id, params.poId, params.lineId);
  if (!line) {
    return NextResponse.json({ error: "Line tidak ditemukan" }, { status: 404 });
  }

  const body = await req.json();
  const onlyProgress =
    body.progressPct !== undefined &&
    Object.keys(body).every((k) => k === "progressPct" || k === "notes");

  if (onlyProgress) {
    if (!canUpdatePoProgress(session.user.role, session.user.menus)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (line.type === "BARANG") {
      return NextResponse.json(
        { error: "Progress barang diisi lewat delivery / surat jalan" },
        { status: 400 }
      );
    }
    if (isFieldProgressLine(line.type)) {
      return NextResponse.json(
        {
          error:
            "Progress jasa instalasi otomatis dari progress lapangan (yang sudah di-approve SM)",
        },
        { status: 400 }
      );
    }
    const progressPct = Math.min(
      100,
      Math.max(0, parseFloat(body.progressPct) || 0)
    );
    const notes =
      body.notes !== undefined
        ? typeof body.notes === "string"
          ? body.notes.trim() || null
          : line.notes
        : undefined;
    await prisma.poLine.update({
      where: { id: line.id },
      data: {
        progressPct,
        ...(notes !== undefined ? { notes } : {}),
      },
    });
  } else {
    if (!canManagePo(session.user.role, session.user.menus)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) {
        return NextResponse.json({ error: "Nama line wajib" }, { status: 400 });
      }
      data.name = name;
    }
    if (body.type !== undefined) {
      if (!isPoLineType(body.type)) {
        return NextResponse.json({ error: "Tipe line tidak valid" }, { status: 400 });
      }
      data.type = body.type;
      if (body.type === "BARANG") data.progressPct = 0;
    }
    if (body.qty !== undefined) {
      const qty = parseFloat(body.qty);
      if (Number.isNaN(qty) || qty < 0) {
        return NextResponse.json({ error: "Qty tidak valid" }, { status: 400 });
      }
      data.qty = qty;
    }
    if (body.bobotPct !== undefined) {
      const bobotPct = parseFloat(body.bobotPct);
      if (Number.isNaN(bobotPct) || bobotPct < 0) {
        return NextResponse.json({ error: "Bobot tidak valid" }, { status: 400 });
      }
      data.bobotPct = bobotPct;
    }
    if (
      body.bobotUnitPct !== undefined ||
      body.bobotPct !== undefined ||
      body.qty !== undefined
    ) {
      const bobotPct =
        data.bobotPct !== undefined
          ? (data.bobotPct as number)
          : line.bobotPct;
      const q = data.qty !== undefined ? (data.qty as number) : line.qty;
      try {
        data.bobotUnitPct = parseBobotUnitPct(
          body.bobotUnitPct !== undefined
            ? body.bobotUnitPct
            : line.bobotUnitPct,
          bobotPct,
          q
        );
      } catch {
        return NextResponse.json(
          { error: "Bobot per unit tidak valid" },
          { status: 400 }
        );
      }
    }
    if (body.unitPrice !== undefined) {
      if (body.unitPrice === null || body.unitPrice === "") {
        data.unitPrice = null;
      } else {
        const unitPrice = parseFloat(body.unitPrice);
        if (Number.isNaN(unitPrice) || unitPrice < 0) {
          return NextResponse.json(
            { error: "Harga satuan tidak valid" },
            { status: 400 }
          );
        }
        data.unitPrice = unitPrice;
      }
    }
    if (body.amount !== undefined) {
      if (body.amount === null || body.amount === "") {
        data.amount = null;
      } else {
        const amount = parseFloat(body.amount);
        if (Number.isNaN(amount) || amount < 0) {
          return NextResponse.json(
            { error: "Nilai line tidak valid" },
            { status: 400 }
          );
        }
        data.amount = amount;
      }
    } else if (data.unitPrice != null || body.unitPrice !== undefined || body.qty !== undefined) {
      const up =
        data.unitPrice !== undefined
          ? (data.unitPrice as number | null)
          : line.unitPrice;
      const q =
        data.qty !== undefined ? (data.qty as number) : line.qty;
      if (up != null && q != null) {
        data.amount = up * q;
      }
    }
    if (body.unit !== undefined) {
      data.unit = String(body.unit || "Unit").trim() || "Unit";
    }
    if (body.code !== undefined) {
      data.code =
        typeof body.code === "string" ? body.code.trim() || null : null;
    }
    if (body.groupName !== undefined) {
      data.groupName =
        typeof body.groupName === "string"
          ? body.groupName.trim() || null
          : null;
    }
    if (body.notes !== undefined) {
      data.notes =
        typeof body.notes === "string" ? body.notes.trim() || null : null;
    }
    if (body.sortOrder !== undefined) {
      const sortOrder = parseInt(String(body.sortOrder), 10);
      if (!Number.isNaN(sortOrder)) data.sortOrder = sortOrder;
    }
    if (body.progressPct !== undefined && line.type !== "BARANG") {
      data.progressPct = Math.min(
        100,
        Math.max(0, parseFloat(body.progressPct) || 0)
      );
    }

    await prisma.poLine.update({ where: { id: line.id }, data });
  }

  const [updated] = await applyFieldProgress(params.id, [
    (await loadPo(params.id, params.poId))!,
  ]);
  return NextResponse.json({
    ...updated!,
    progressPct: calcPoProgress(updated!.lines),
    bobotTotal: sumBobot(updated!.lines),
  });
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
  if (!canManagePo(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const line = await findLine(params.id, params.poId, params.lineId);
  if (!line) {
    return NextResponse.json({ error: "Line tidak ditemukan" }, { status: 404 });
  }

  await prisma.poLine.delete({ where: { id: line.id } });
  const [updated] = await applyFieldProgress(params.id, [
    (await loadPo(params.id, params.poId))!,
  ]);
  return NextResponse.json({
    ...updated!,
    progressPct: calcPoProgress(updated!.lines),
    bobotTotal: sumBobot(updated!.lines),
  });
}

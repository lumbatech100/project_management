import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, forbidUnlessMenu } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManagePo } from "@/lib/utils";
import { calcPoProgress, sumBobot } from "@/lib/po-progress";
import { applyFieldProgress } from "@/lib/po-field-progress";

type Params = { params: Promise<{ id: string; poId: string }> };

const lineInclude = {
  deliveries: { orderBy: [{ date: "desc" as const }, { createdAt: "desc" as const }] },
};

async function findPo(projectId: string, poId: string) {
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

function serializePo(
  po: NonNullable<Awaited<ReturnType<typeof findPo>>>
) {
  return {
    ...po,
    progressPct: calcPoProgress(po.lines),
    bobotTotal: sumBobot(po.lines),
  };
}

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
  const noMenu = forbidUnlessMenu(session.user, "project.po");
  if (noMenu) return noMenu;

  const po = await findPo(params.id, params.poId);
  if (!po) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [withField] = await applyFieldProgress(params.id, [po]);
  return NextResponse.json(serializePo(withField));
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
  if (!canManagePo(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await findPo(params.id, params.poId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const data: {
    number?: string;
    title?: string | null;
    notes?: string | null;
    totalValue?: number | null;
  } = {};

  if (body.number !== undefined) {
    const number = String(body.number || "").trim();
    if (!number) {
      return NextResponse.json({ error: "Nomor PO wajib" }, { status: 400 });
    }
    data.number = number;
  }
  if (body.title !== undefined) {
    data.title =
      typeof body.title === "string" ? body.title.trim() || null : null;
  }
  if (body.notes !== undefined) {
    data.notes =
      typeof body.notes === "string" ? body.notes.trim() || null : null;
  }
  if (body.totalValue !== undefined) {
    if (body.totalValue === null || body.totalValue === "") {
      data.totalValue = null;
    } else {
      const v = parseFloat(body.totalValue);
      if (Number.isNaN(v) || v < 0) {
        return NextResponse.json({ error: "Nilai PO tidak valid" }, { status: 400 });
      }
      data.totalValue = v;
    }
  }

  try {
    await prisma.purchaseOrder.update({
      where: { id: params.poId },
      data,
    });
    const po = await findPo(params.id, params.poId);
    const [withField] = await applyFieldProgress(params.id, [po!]);
    return NextResponse.json(serializePo(withField));
  } catch (e: unknown) {
    const msg =
      e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002"
        ? "Nomor PO sudah dipakai di project ini"
        : "Gagal update PO";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
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

  const existing = await findPo(params.id, params.poId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.purchaseOrder.delete({ where: { id: params.poId } });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, forbidUnlessMenu } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManagePo } from "@/lib/utils";
import { calcPoProgress, sumBobot } from "@/lib/po-progress";
import { applyFieldProgress } from "@/lib/po-field-progress";

type Params = { params: Promise<{ id: string }> };

const lineInclude = {
  deliveries: { orderBy: [{ date: "desc" as const }, { createdAt: "desc" as const }] },
};

function serializePo<
  T extends {
    lines: Parameters<typeof calcPoProgress>[0];
    id: string;
    number: string;
    title: string | null;
    totalValue: number | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }
>(po: T) {
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

  const list = await prisma.purchaseOrder.findMany({
    where: { projectId: params.id },
    include: {
      lines: {
        include: lineInclude,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const withField = await applyFieldProgress(params.id, list);
  return NextResponse.json(withField.map(serializePo));
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
  if (!canManagePo(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 1 project = 1 PO; PO berikutnya dibuat sebagai project terpisah
  const existing = await prisma.purchaseOrder.count({
    where: { projectId: params.id },
  });
  if (existing > 0) {
    return NextResponse.json(
      {
        error:
          "Project ini sudah punya PO. Satu project hanya untuk satu PO — buat project baru untuk PO lain.",
      },
      { status: 409 }
    );
  }

  const body = await req.json();
  const number = String(body.number || "").trim();
  if (!number) {
    return NextResponse.json({ error: "Nomor PO wajib" }, { status: 400 });
  }

  const title =
    typeof body.title === "string" ? body.title.trim() || null : null;
  const notes =
    typeof body.notes === "string" ? body.notes.trim() || null : null;
  const totalValue =
    body.totalValue !== undefined && body.totalValue !== null && body.totalValue !== ""
      ? parseFloat(body.totalValue)
      : null;
  if (totalValue != null && (Number.isNaN(totalValue) || totalValue < 0)) {
    return NextResponse.json({ error: "Nilai PO tidak valid" }, { status: 400 });
  }

  try {
    const po = await prisma.purchaseOrder.create({
      data: {
        projectId: params.id,
        number,
        title,
        notes,
        totalValue,
      },
      include: {
        lines: {
          include: lineInclude,
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    const [withField] = await applyFieldProgress(params.id, [po]);
    return NextResponse.json(serializePo(withField), { status: 201 });
  } catch (e: unknown) {
    const msg = e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002"
      ? "Nomor PO sudah dipakai di project ini"
      : "Gagal membuat PO";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

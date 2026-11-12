import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canUpdatePoProgress } from "@/lib/utils";

type Params = { params: Promise<{ id: string; poId: string; lineId: string }> };

/** Penerimaan barang PO dicatat lewat Inventory › Barang masuk (lib/inventory applyNoteEffects). */
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
  if (!canUpdatePoProgress(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const line = await prisma.poLine.findFirst({
    where: {
      id: params.lineId,
      poId: params.poId,
      po: { projectId: params.id },
    },
    select: { type: true },
  });
  if (!line) {
    return NextResponse.json({ error: "Line tidak ditemukan" }, { status: 404 });
  }
  return NextResponse.json(
    {
      error:
        "Penerimaan barang PO sekarang dicatat lewat Inventory › Barang masuk (otomatis masuk kumulatif).",
    },
    { status: 400 }
  );
}

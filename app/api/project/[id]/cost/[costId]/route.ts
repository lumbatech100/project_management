import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canRecordExpense } from "@/lib/utils";
import { deleteUploadByUrl } from "@/lib/storage";

type Params = { params: Promise<{ id: string; costId: string }> };

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
  if (!canRecordExpense(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const item = await prisma.costItem.findFirst({
    where: { id: params.costId, projectId: params.id },
  });
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.costItem.delete({ where: { id: params.costId } });
  await deleteUploadByUrl(item.receiptUrl);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canManageWorkers } from "@/lib/utils";
import { newInviteToken } from "@/lib/worker-groups";

type Params = { params: Promise<{ id: string; workerId: string }> };

/** Buat / refresh link isi data diri untuk pekerja. */
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
  if (!canManageWorkers(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.worker.findFirst({
    where: { id: params.workerId, projectId: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = existing.inviteToken || newInviteToken();
  const worker = await prisma.worker.update({
    where: { id: params.workerId },
    data: {
      inviteToken: token,
      inviteStatus:
        existing.inviteStatus === "FILLED" ? "FILLED" : "PENDING",
    },
  });

  return NextResponse.json({
    ...worker,
    invitePath: `/isi-data/${token}`,
  });
}

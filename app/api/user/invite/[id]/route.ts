import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/utils";
import {
  inviteExpiry,
  newUserInviteToken,
  userInvitePath,
} from "@/lib/user-invites";

type Params = { params: Promise<{ id: string }> };

async function guard(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** Buat link baru (link lama langsung tidak berlaku) + perpanjang masa aktif. */
export async function PATCH(req: NextRequest, props: Params) {
  const params = await props.params;
  const denied = await guard(req);
  if (denied) return denied;

  const invite = await prisma.userInvite.findFirst({
    where: { id: params.id, acceptedAt: null },
    select: { id: true },
  });
  if (!invite) {
    return NextResponse.json({ error: "Undangan tidak ditemukan" }, { status: 404 });
  }

  const updated = await prisma.userInvite.update({
    where: { id: invite.id },
    data: { token: newUserInviteToken(), expiresAt: inviteExpiry() },
    select: { id: true, token: true, expiresAt: true },
  });
  return NextResponse.json({
    id: updated.id,
    expiresAt: updated.expiresAt,
    invitePath: userInvitePath(updated.token),
  });
}

export async function DELETE(req: NextRequest, props: Params) {
  const params = await props.params;
  const denied = await guard(req);
  if (denied) return denied;

  const { count } = await prisma.userInvite.deleteMany({
    where: { id: params.id, acceptedAt: null },
  });
  if (count === 0) {
    return NextResponse.json({ error: "Undangan tidak ditemukan" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

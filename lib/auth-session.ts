import { prisma } from "./prisma";

export const WEB_SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;

export const SESSION_REVOKED = "SESSION_REVOKED";

export async function createAuthSession(
  userId: string,
  kind: "web" | "mobile",
  maxAgeSec: number
) {
  const session = await prisma.authSession.create({
    data: {
      userId,
      kind,
      expiresAt: new Date(Date.now() + maxAgeSec * 1000),
    },
    select: { id: true },
  });
  return session.id;
}

/** Sesi aktif + data user terbaru, atau null jika dicabut / kedaluwarsa / bukan milik user. */
export async function getActiveAuthSession(
  sessionId: string | null | undefined,
  userId: string
) {
  if (!sessionId) return null;
  const session = await prisma.authSession.findUnique({
    where: { id: sessionId },
    select: {
      userId: true,
      revokedAt: true,
      expiresAt: true,
      user: { select: { role: true, menus: true, name: true, email: true } },
    },
  });
  if (
    !session ||
    session.userId !== userId ||
    session.revokedAt ||
    session.expiresAt.getTime() <= Date.now()
  ) {
    return null;
  }
  return session.user;
}

export async function revokeAuthSession(sessionId: string | null | undefined) {
  if (!sessionId) return;
  await prisma.authSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Cabut semua sesi user (ganti password / ubah role), kecuali sesi yang sedang dipakai. */
export async function revokeUserSessions(userId: string, exceptId?: string) {
  await prisma.authSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}

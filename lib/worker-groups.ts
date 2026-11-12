import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export function newInviteToken() {
  return randomBytes(24).toString("base64url");
}

export const GROUP_LEADERS_INCLUDE = {
  leaders: {
    select: { user: { select: { id: true, name: true, email: true } } },
  },
} as const;

/** Pastikan grup bawaan Internal ada + semua grup punya invite token. */
export async function ensureDefaultWorkerGroups(projectId: string) {
  const hasInternal = await prisma.workerGroup.findFirst({
    where: { projectId, kind: "INTERNAL" },
    select: { id: true },
  });

  if (!hasInternal) {
    await prisma.workerGroup.create({
      data: {
        projectId,
        name: "Internal",
        kind: "INTERNAL",
        sortOrder: 0,
        inviteToken: newInviteToken(),
        inviteEnabled: true,
      },
    });
  }

  // Backfill token untuk grup lama yang belum punya
  const needToken = await prisma.workerGroup.findMany({
    where: { projectId, inviteToken: null },
    select: { id: true },
  });
  for (const g of needToken) {
    await prisma.workerGroup.update({
      where: { id: g.id },
      data: { inviteToken: newInviteToken(), inviteEnabled: true },
    });
  }

  const groups = await prisma.workerGroup.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: GROUP_LEADERS_INCLUDE,
  });
  return groups.map(({ leaders, ...g }) => ({
    ...g,
    leaders: leaders.map((l) => l.user),
  }));
}

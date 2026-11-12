import { prisma } from "./prisma";

export const BLOCKER_COMMENT_MAX = 1000;

/** Laporan titik yang sudah disubmit dan punya teks blocker. */
export function blockerIssueWhere(
  projectId: string,
  filter: "all" | "open" | "closed" = "all"
) {
  return {
    blocker: { not: "" },
    status: { not: "DRAFT" as const },
    ...(filter === "open" ? { closedAt: null } : {}),
    ...(filter === "closed" ? { closedAt: { not: null } } : {}),
    dailyReport: { projectId },
  };
}

export function isUnread(
  readAt: Date | null | undefined,
  latestOtherAt: Date | null | undefined
) {
  if (!readAt) return true;
  return !!latestOtherAt && latestOtherAt > readAt;
}

/** Submitter / penulis komentar tidak dapat badge untuk aksinya sendiri. */
export function markBlockerRead(markerReportId: string, userId: string, at = new Date()) {
  return prisma.blockerRead.upsert({
    where: { markerReportId_userId: { markerReportId, userId } },
    create: { markerReportId, userId, readAt: at },
    update: { readAt: at },
  });
}

export async function unreadBlockerCount(projectId: string, userId: string) {
  const rows = await prisma.markerDailyReport.findMany({
    where: {
      blocker: { not: "" },
      status: { not: "DRAFT" },
      dailyReport: { projectId },
    },
    select: {
      blocker: true,
      reads: { where: { userId }, select: { readAt: true }, take: 1 },
      comments: {
        where: { OR: [{ userId: null }, { userId: { not: userId } }] },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });
  let n = 0;
  for (const row of rows) {
    if (!row.blocker?.trim()) continue;
    if (isUnread(row.reads[0]?.readAt, row.comments[0]?.createdAt)) n++;
  }
  return n;
}

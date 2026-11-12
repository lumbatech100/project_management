import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { hasMenu } from "@/lib/menus";
import { blockerIssueWhere, isUnread } from "@/lib/blocker";
import { formatDateKey } from "@/lib/workday";

type Params = { params: Promise<{ id: string }> };

async function guard(req: NextRequest, projectId: string) {
  const session = await getApiSession(req);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }
  const denied = await forbidUnlessProjectAccess(
    session.user.id,
    session.user.role,
    projectId
  );
  if (denied) return { error: denied } as const;
  if (!hasMenu(session.user.menus, "project.blocker")) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }
  return { user: session.user } as const;
}

/** Daftar isu blocker. ?tab=all|open|closed. Default semua, termasuk yang sudah ditutup. */
export async function GET(req: NextRequest, props: Params) {
  const params = await props.params;
  const ctx = await guard(req, params.id);
  if ("error" in ctx) return ctx.error;

  const raw = req.nextUrl.searchParams.get("tab");
  const filter = raw === "open" || raw === "closed" ? raw : "all";
  const rows = await prisma.markerDailyReport.findMany({
    where: blockerIssueWhere(params.id, filter),
    orderBy: [{ submittedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      blocker: true,
      status: true,
      submittedAt: true,
      submittedBy: true,
      closedAt: true,
      closedBy: true,
      marker: { select: { label: true, floor: { select: { name: true } } } },
      dailyReport: { select: { workDate: true } },
      reads: {
        where: { userId: ctx.user.id },
        select: { readAt: true },
        take: 1,
      },
      comments: {
        where: { OR: [{ userId: null }, { userId: { not: ctx.user.id } }] },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, authorName: true, body: true },
      },
      _count: { select: { comments: true } },
    },
  });

  const issues = rows
    .filter((row) => row.blocker?.trim())
    .map((row) => ({
      id: row.id,
      blocker: row.blocker,
      reportStatus: row.status,
      submittedAt: row.submittedAt,
      submittedBy: row.submittedBy,
      closedAt: row.closedAt,
      closedBy: row.closedBy,
      workDate: formatDateKey(row.dailyReport.workDate),
      markerLabel: row.marker.label,
      floorName: row.marker.floor.name,
      commentCount: row._count.comments,
      lastComment: row.comments[0]
        ? {
            at: row.comments[0].createdAt,
            authorName: row.comments[0].authorName,
            body: row.comments[0].body,
          }
        : null,
      unread: isUnread(row.reads[0]?.readAt, row.comments[0]?.createdAt),
    }));

  return NextResponse.json({ issues });
}

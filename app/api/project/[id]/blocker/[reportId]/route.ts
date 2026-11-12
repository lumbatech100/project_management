import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { hasMenu } from "@/lib/menus";
import { BLOCKER_COMMENT_MAX, markBlockerRead } from "@/lib/blocker";
import { formatDateKey } from "@/lib/workday";

type Params = { params: Promise<{ id: string; reportId: string }> };

async function loadIssue(projectId: string, reportId: string) {
  const report = await prisma.markerDailyReport.findFirst({
    where: {
      id: reportId,
      status: { not: "DRAFT" },
      dailyReport: { projectId },
    },
    include: {
      marker: { select: { label: true, floor: { select: { name: true } } } },
      dailyReport: { select: { workDate: true } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!report?.blocker?.trim()) return null;
  return report;
}

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

function present(report: NonNullable<Awaited<ReturnType<typeof loadIssue>>>) {
  return {
    id: report.id,
    blocker: report.blocker,
    blockerPhotos: report.blockerPhotos,
    reportStatus: report.status,
    submittedAt: report.submittedAt,
    submittedBy: report.submittedBy,
    closedAt: report.closedAt,
    closedBy: report.closedBy,
    workDate: formatDateKey(report.dailyReport.workDate),
    markerLabel: report.marker.label,
    floorName: report.marker.floor.name,
    comments: report.comments.map((c) => ({
      id: c.id,
      body: c.body,
      authorName: c.authorName,
      userId: c.userId,
      createdAt: c.createdAt,
    })),
  };
}

/** Buka isu dan tandai sudah dibaca. */
export async function GET(req: NextRequest, props: Params) {
  const params = await props.params;
  const ctx = await guard(req, params.id);
  if ("error" in ctx) return ctx.error;

  const report = await loadIssue(params.id, params.reportId);
  if (!report) {
    return NextResponse.json({ error: "Blocker tidak ditemukan" }, { status: 404 });
  }
  await markBlockerRead(report.id, ctx.user.id);
  return NextResponse.json({ issue: present(report) });
}

/** action: comment | close */
export async function POST(req: NextRequest, props: Params) {
  const params = await props.params;
  const ctx = await guard(req, params.id);
  if ("error" in ctx) return ctx.error;

  const report = await loadIssue(params.id, params.reportId);
  if (!report) {
    return NextResponse.json({ error: "Blocker tidak ditemukan" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const action = body && typeof body === "object" ? body.action : null;

  if (action === "close") {
    if (ctx.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Hanya Admin yang bisa menutup isu" }, { status: 403 });
    }
    if (report.closedAt) {
      return NextResponse.json({ error: "Isu sudah ditutup" }, { status: 400 });
    }
    await prisma.markerDailyReport.update({
      where: { id: report.id },
      data: {
        closedAt: new Date(),
        closedBy: ctx.user.name || ctx.user.email || "Admin",
      },
    });
    await markBlockerRead(report.id, ctx.user.id);
    const fresh = await loadIssue(params.id, params.reportId);
    return NextResponse.json({ issue: fresh ? present(fresh) : null });
  }

  if (action === "comment") {
    if (report.closedAt) {
      return NextResponse.json({ error: "Isu sudah ditutup" }, { status: 400 });
    }
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "Komentar kosong" }, { status: 400 });
    }
    if (text.length > BLOCKER_COMMENT_MAX) {
      return NextResponse.json(
        { error: `Komentar maks ${BLOCKER_COMMENT_MAX} karakter` },
        { status: 400 }
      );
    }
    await prisma.blockerComment.create({
      data: {
        markerReportId: report.id,
        userId: ctx.user.id,
        authorName: ctx.user.name || ctx.user.email || "User",
        body: text,
      },
    });
    await markBlockerRead(report.id, ctx.user.id);
    const fresh = await loadIssue(params.id, params.reportId);
    return NextResponse.json({ issue: fresh ? present(fresh) : null });
  }

  return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
}

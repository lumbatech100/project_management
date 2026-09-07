import nodemailer from "nodemailer";
import type { DailyReportSnapshot } from "@/lib/daily-report";
import {
  buildDailyReportHtml,
  buildDailyReportText,
} from "@/lib/daily-report-format";
import { prisma } from "@/lib/prisma";

export async function sendDailyReportEmailStub(
  snapshot: DailyReportSnapshot
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (
    snapshot.counts.total === 0 &&
    !snapshot.notes &&
    !snapshot.blocker &&
    !(snapshot.markerReports && snapshot.markerReports.length > 0)
  ) {
    await prisma.dailyReport.update({
      where: { id: snapshot.reportId },
      data: {
        emailStatus: "skipped",
        emailSentAt: new Date(),
        emailError: null,
      },
    });
    return { ok: true, skipped: true };
  }

  const project = await prisma.project.findUnique({
    where: { id: snapshot.projectId },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      smtpPass: true,
      mailFrom: true,
      mailFromName: true,
      mailTo: true,
      mailCc: true,
    },
  });

  if (!project) {
    return { ok: false, error: "Project tidak ditemukan" };
  }

  if (!project.smtpHost || !project.mailFrom || project.mailTo.length === 0) {
    await prisma.dailyReport.update({
      where: { id: snapshot.reportId },
      data: {
        emailStatus: "skipped",
        emailSentAt: new Date(),
        emailError:
          "SMTP belum dikonfigurasi (host / pengirim / penerima di Project Details)",
      },
    });
    return {
      ok: true,
      skipped: true,
      error: "SMTP belum dikonfigurasi",
    };
  }

  const transporter = nodemailer.createTransport({
    host: project.smtpHost,
    port: project.smtpPort ?? 587,
    secure: project.smtpSecure,
    auth:
      project.smtpUser && project.smtpPass
        ? { user: project.smtpUser, pass: project.smtpPass }
        : undefined,
  });

  const from = project.mailFromName
    ? `"${project.mailFromName}" <${project.mailFrom}>`
    : project.mailFrom;

  const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || "";
  const projectUrl = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/project/${snapshot.projectId}/laporan`
    : undefined;

  try {
    await transporter.sendMail({
      from,
      to: project.mailTo.join(", "),
      cc: project.mailCc.length ? project.mailCc.join(", ") : undefined,
      subject: `[Simplo] Laporan Harian ${snapshot.projectName} — ${snapshot.workDate}`,
      html: buildDailyReportHtml(snapshot, { projectUrl }),
      text: buildDailyReportText(snapshot),
    });

    await prisma.dailyReport.update({
      where: { id: snapshot.reportId },
      data: {
        emailStatus: "sent",
        emailSentAt: new Date(),
        emailError: null,
      },
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal kirim email";
    await prisma.dailyReport.update({
      where: { id: snapshot.reportId },
      data: {
        emailStatus: "failed",
        emailError: msg,
      },
    });
    return { ok: false, error: msg };
  }
}

export async function processPendingDailyReportEmails(limit = 50) {
  const pending = await prisma.dailyReport.findMany({
    where: {
      status: "CLOSED",
      OR: [{ emailStatus: "pending" }, { emailStatus: null }],
    },
    take: limit,
    orderBy: { closedAt: "asc" },
  });

  const results: {
    reportId: string;
    ok: boolean;
    skipped?: boolean;
    error?: string;
  }[] = [];

  for (const r of pending) {
    const { buildDailyReportSnapshot } = await import("@/lib/daily-report");
    const snap = await buildDailyReportSnapshot(r.id);
    if (!snap) {
      results.push({ reportId: r.id, ok: false, error: "snapshot missing" });
      continue;
    }
    try {
      const res = await sendDailyReportEmailStub(snap);
      results.push({ reportId: r.id, ...res });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "send failed";
      await prisma.dailyReport.update({
        where: { id: r.id },
        data: { emailStatus: "failed", emailError: msg },
      });
      results.push({ reportId: r.id, ok: false, error: msg });
    }
  }

  return results;
}

import nodemailer from "nodemailer";
import type { DailyReportSnapshot } from "@/lib/daily-report";
import {
  buildDailyReportHtml,
  buildDailyReportText,
} from "@/lib/daily-report-format";
import { buildRekapProgressHtml } from "@/lib/rekap-progress-attachment";
import {
  formatFromHeader,
  resolveMailSenders,
} from "@/lib/mail-senders";
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
      mailSenders: true,
      mailTo: true,
      mailCc: true,
    },
  });

  if (!project) {
    return { ok: false, error: "Project tidak ditemukan" };
  }

  const senders = resolveMailSenders(project);
  const primary = senders[0];

  if (!project.smtpHost || !primary || project.mailTo.length === 0) {
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

  const from = formatFromHeader(primary);

  const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || "";
  const projectUrl = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/project/${snapshot.projectId}/laporan`
    : undefined;

  try {
    const rekapHtml =
      snapshot.rekapFloors && snapshot.rekapFloors.length > 0
        ? buildRekapProgressHtml({
            projectName: snapshot.projectName,
            workDate: snapshot.workDate,
            floors: snapshot.rekapFloors,
          })
        : "";

    const mainHtml = buildDailyReportHtml(snapshot, { projectUrl });
    const htmlWithNote = rekapHtml
      ? `${mainHtml.replace(
          "</body>",
          `<div style="margin-top:24px;padding:12px;border:1px dashed #94a3b8;border-radius:8px;font-size:13px;color:#475569">
            <strong>Lampiran:</strong> Rekap Progress (landscape) — terlampir sebagai file HTML.
            Hanya lantai yang ada pekerjaan hari ini · max 50 pintu / halaman · ganti lantai = halaman baru.
          </div></body>`
        )}`
      : mainHtml;

    await transporter.sendMail({
      from,
      to: project.mailTo.join(", "),
      cc: project.mailCc.length ? project.mailCc.join(", ") : undefined,
      subject: `[Simplo] Laporan Harian ${snapshot.projectName} — ${snapshot.workDate}`,
      html: htmlWithNote,
      text: buildDailyReportText(snapshot),
      attachments: rekapHtml
        ? [
            {
              filename: `rekap-progress-${snapshot.workDate}.html`,
              content: rekapHtml,
              contentType: "text/html; charset=utf-8",
            },
          ]
        : undefined,
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Kirim satu pesan tes. Tidak menyimpan pengaturan. */
export async function sendProjectTestEmail(input: {
  projectName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string | null;
  fromEmail: string;
  fromName: string;
  mailTo: string[];
  mailCc: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const from = formatFromHeader({
    email: input.fromEmail,
    name: input.fromName,
  });
  const when = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "full",
    timeStyle: "short",
  });
  const transporter = nodemailer.createTransport({
    host: input.smtpHost,
    port: input.smtpPort,
    secure: input.smtpSecure,
    auth:
      input.smtpUser && input.smtpPass
        ? { user: input.smtpUser, pass: input.smtpPass }
        : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  const text = [
    "Ini pesan tes dari Simplo PMS.",
    "",
    `Pengaturan email project "${input.projectName}" berhasil mengirim.`,
    `Waktu: ${when} WIB`,
  ].join("\n");
  try {
    await transporter.sendMail({
      from,
      to: input.mailTo.join(", "),
      cc: input.mailCc.length ? input.mailCc.join(", ") : undefined,
      subject: `[Simplo] Tes email — ${input.projectName}`,
      text,
      html: `<p>Ini pesan tes dari Simplo PMS.</p>
<p>Pengaturan email project <strong>${escapeHtml(input.projectName)}</strong> berhasil mengirim.</p>
<p style="color:#64748b;font-size:13px">Waktu: ${escapeHtml(when)} WIB</p>`,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal kirim email";
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

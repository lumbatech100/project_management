import { NextRequest, NextResponse } from "next/server";
import { closeDailyReportsForToday } from "@/lib/daily-report";
import { processPendingDailyReportEmails } from "@/lib/email";
import { getJakartaParts, REPORT_CUTOFF_HOUR } from "@/lib/workday";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Platform cron — crontab / scheduler eksternal.
 * Header: Authorization: Bearer $CRON_SECRET
 *
 * Crontab contoh (19:00 WIB = 12:00 UTC):
 *   0 12 * * * curl -s -X POST https://HOST/api/cron/close-daily-reports \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * ?force=1  — test close tanpa tunggu jam 19
 * ?email=0  — skip stub email
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET belum di-set di environment" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const sendEmail = url.searchParams.get("email") !== "0";
  const jakarta = getJakartaParts();

  const close = await closeDailyReportsForToday(new Date(), { force });

  let emails: Awaited<ReturnType<typeof processPendingDailyReportEmails>> | null =
    null;
  if (sendEmail && !close.skipped) {
    emails = await processPendingDailyReportEmails();
  }

  return NextResponse.json({
    ok: true,
    jakarta,
    cutoffHour: REPORT_CUTOFF_HOUR,
    close,
    emails,
  });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jakarta = getJakartaParts();
  return NextResponse.json({
    ok: true,
    cutoffHour: REPORT_CUTOFF_HOUR,
    timezone: "Asia/Jakarta",
    jakarta,
    pastCutoff: jakarta.hour >= REPORT_CUTOFF_HOUR,
  });
}

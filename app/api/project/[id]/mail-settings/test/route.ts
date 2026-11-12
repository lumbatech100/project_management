import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { sendProjectTestEmail } from "@/lib/email";
import { parseMailSenders } from "@/lib/mail-senders";
import { prisma } from "@/lib/prisma";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { canCreateProject } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .filter((e): e is string => typeof e === "string")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/[,;\n]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

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
  if (!canCreateProject(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, smtpPass: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const smtpHost = typeof body.smtpHost === "string" ? body.smtpHost.trim() : "";
  if (!smtpHost) {
    return NextResponse.json({ error: "Isi SMTP host dulu" }, { status: 400 });
  }

  let smtpPort = 587;
  if (body.smtpPort !== "" && body.smtpPort != null) {
    const port = parseInt(String(body.smtpPort), 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      return NextResponse.json({ error: "Port SMTP tidak valid" }, { status: 400 });
    }
    smtpPort = port;
  }

  const senders = Array.isArray(body.mailSenders)
    ? parseMailSenders(body.mailSenders).slice(0, 1)
    : [];
  const from = senders[0];
  if (!from || !EMAIL_RE.test(from.email)) {
    return NextResponse.json(
      { error: "Isi email pengirim yang valid dulu" },
      { status: 400 }
    );
  }

  const mailTo = parseEmails(body.mailTo);
  const mailCc = parseEmails(body.mailCc);
  if (mailTo.length === 0) {
    return NextResponse.json(
      { error: "Isi minimal satu penerima" },
      { status: 400 }
    );
  }
  for (const email of [...mailTo, ...mailCc]) {
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: `Email tidak valid: ${email}` },
        { status: 400 }
      );
    }
  }

  const passIncoming = typeof body.smtpPass === "string" ? body.smtpPass : "";
  const smtpPass = passIncoming || project.smtpPass || null;
  const smtpUser = typeof body.smtpUser === "string" ? body.smtpUser.trim() : "";

  const sent = await sendProjectTestEmail({
    projectName: project.name,
    smtpHost,
    smtpPort,
    smtpSecure: !!body.smtpSecure,
    smtpUser,
    smtpPass,
    fromEmail: from.email,
    fromName: from.name,
    mailTo,
    mailCc,
  });
  if (!sent.ok) {
    return NextResponse.json({ error: sent.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, to: mailTo, cc: mailCc });
}

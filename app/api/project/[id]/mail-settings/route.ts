import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import {
  parseMailSenders,
  resolveMailSenders,
  type MailSender,
} from "@/lib/mail-senders";
import { prisma } from "@/lib/prisma";
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

function publicMailSettings(project: {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPass: string | null;
  mailFrom: string | null;
  mailFromName: string | null;
  mailSenders: unknown;
  mailTo: string[];
  mailCc: string[];
}) {
  const senders = resolveMailSenders(project);
  const primary = senders[0];
  return {
    smtpHost: project.smtpHost || "",
    smtpPort: project.smtpPort ?? 587,
    smtpSecure: project.smtpSecure,
    smtpUser: project.smtpUser || "",
    smtpPassSet: !!project.smtpPass,
    mailFrom: primary?.email || project.mailFrom || "",
    mailFromName: primary?.name || project.mailFromName || "",
    mailSenders: senders,
    mailTo: project.mailTo || [],
    mailCc: project.mailCc || [],
  };
}

export async function GET(req: NextRequest, props: Params) {
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
    select: {
      id: true,
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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(publicMailSettings(project));
}

export async function PUT(req: NextRequest, props: Params) {
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

  const existing = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, smtpPass: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();

  const smtpHost =
    typeof body.smtpHost === "string" ? body.smtpHost.trim() : "";
  const smtpUser =
    typeof body.smtpUser === "string" ? body.smtpUser.trim() : "";

  let senders: MailSender[] = [];
  if (Array.isArray(body.mailSenders)) {
    senders = parseMailSenders(body.mailSenders).slice(0, 1);
  } else if (typeof body.mailFrom === "string" && body.mailFrom.trim()) {
    // legacy single from
    senders = [
      {
        email: body.mailFrom.trim().toLowerCase(),
        name:
          typeof body.mailFromName === "string"
            ? body.mailFromName.trim()
            : "",
      },
    ];
  }

  let smtpPort = 587;
  if (body.smtpPort !== "" && body.smtpPort != null) {
    const p = parseInt(String(body.smtpPort), 10);
    if (Number.isNaN(p) || p < 1 || p > 65535) {
      return NextResponse.json({ error: "Port SMTP tidak valid" }, { status: 400 });
    }
    smtpPort = p;
  }

  const smtpSecure = !!body.smtpSecure;
  const mailTo = parseEmails(body.mailTo);
  const mailCc = parseEmails(body.mailCc);

  for (const e of [...mailTo, ...mailCc]) {
    if (!EMAIL_RE.test(e)) {
      return NextResponse.json(
        { error: `Email tidak valid: ${e}` },
        { status: 400 }
      );
    }
  }
  for (const s of senders) {
    if (!EMAIL_RE.test(s.email)) {
      return NextResponse.json(
        { error: `Email pengirim tidak valid: ${s.email}` },
        { status: 400 }
      );
    }
  }

  const primary = senders[0] || null;

  const passIncoming =
    typeof body.smtpPass === "string" ? body.smtpPass : undefined;
  const smtpPass =
    passIncoming === undefined || passIncoming === ""
      ? existing.smtpPass
      : passIncoming;

  const project = await prisma.project.update({
    where: { id: existing.id },
    data: {
      smtpHost: smtpHost || null,
      smtpPort,
      smtpSecure,
      smtpUser: smtpUser || null,
      smtpPass: smtpPass || null,
      mailFrom: primary?.email || null,
      mailFromName: primary?.name || null,
      mailSenders: senders as unknown as Prisma.InputJsonValue,
      mailTo,
      mailCc,
    },
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

  return NextResponse.json(publicMailSettings(project));
}

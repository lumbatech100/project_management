import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCreateProject } from "@/lib/utils";

type Params = { params: { id: string } };

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
  mailTo: string[];
  mailCc: string[];
}) {
  return {
    smtpHost: project.smtpHost || "",
    smtpPort: project.smtpPort ?? 587,
    smtpSecure: project.smtpSecure,
    smtpUser: project.smtpUser || "",
    smtpPassSet: !!project.smtpPass,
    mailFrom: project.mailFrom || "",
    mailFromName: project.mailFromName || "",
    mailTo: project.mailTo || [],
    mailCc: project.mailCc || [],
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canCreateProject(session.user.role)) {
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
      mailTo: true,
      mailCc: true,
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(publicMailSettings(project));
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canCreateProject(session.user.role)) {
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
  const mailFrom =
    typeof body.mailFrom === "string" ? body.mailFrom.trim() : "";
  const mailFromName =
    typeof body.mailFromName === "string" ? body.mailFromName.trim() : "";

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
  if (mailFrom && !EMAIL_RE.test(mailFrom)) {
    return NextResponse.json(
      { error: "Email pengirim tidak valid" },
      { status: 400 }
    );
  }

  const passIncoming =
    typeof body.smtpPass === "string" ? body.smtpPass : undefined;
  // kosong = pertahankan password lama
  const smtpPass =
    passIncoming === undefined || passIncoming === ""
      ? existing.smtpPass
      : passIncoming;

  const project = await prisma.project.update({
    where: { id: params.id },
    data: {
      smtpHost: smtpHost || null,
      smtpPort,
      smtpSecure,
      smtpUser: smtpUser || null,
      smtpPass: smtpPass || null,
      mailFrom: mailFrom || null,
      mailFromName: mailFromName || null,
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
      mailTo: true,
      mailCc: true,
    },
  });

  return NextResponse.json(publicMailSettings(project));
}

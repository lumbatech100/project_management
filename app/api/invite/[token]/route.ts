import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeMenus } from "@/lib/menus";
import { MIN_PASSWORD_LENGTH } from "@/lib/user-invites";
import { checkPublicFormLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

async function findInvite(token: string | undefined) {
  const t = token?.trim();
  if (!t) return null;
  return prisma.userInvite.findUnique({ where: { token: t } });
}

function inviteError(
  invite: Awaited<ReturnType<typeof findInvite>>
): NextResponse | null {
  if (!invite) {
    return NextResponse.json(
      { error: "Link undangan tidak ditemukan atau sudah dibatalkan" },
      { status: 404 }
    );
  }
  if (invite.acceptedAt) {
    return NextResponse.json(
      { error: "Undangan ini sudah dipakai. Silakan login.", accepted: true },
      { status: 410 }
    );
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "Link undangan sudah kedaluwarsa. Minta admin kirim link baru." },
      { status: 410 }
    );
  }
  return null;
}

export async function GET(_req: NextRequest, props: Params) {
  const params = await props.params;
  const invite = await findInvite(params.token);
  const err = inviteError(invite);
  if (err || !invite) return err!;

  const projects = await prisma.project.findMany({
    where: { id: { in: invite.projectIds } },
    select: { name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    name: invite.name,
    email: invite.email,
    expiresAt: invite.expiresAt,
    projects: projects.map((p) => p.name),
  });
}

export async function POST(req: NextRequest, props: Params) {
  const params = await props.params;
  const limit = checkPublicFormLimit("user-invite", req.headers, 10);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const invite = await findInvite(params.token);
  const err = inviteError(invite);
  if (err || !invite) return err!;

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    password?: string;
    confirmPassword?: string;
  };
  const name = body.name?.trim() || invite.name;
  const password = body.password || "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password minimal ${MIN_PASSWORD_LENGTH} karakter` },
      { status: 400 }
    );
  }
  if (password !== body.confirmPassword) {
    return NextResponse.json(
      { error: "Konfirmasi password tidak sama" },
      { status: 400 }
    );
  }

  const passwordHash = await hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      // Klaim undangan dulu supaya klik ganda / 2 tab tidak bikin 2 akun.
      const claimed = await tx.userInvite.updateMany({
        where: { id: invite.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error("ALREADY_ACCEPTED");

      const exists = await tx.user.findFirst({
        where: { email: { equals: invite.email, mode: "insensitive" } },
        select: { id: true },
      });
      if (exists) throw new Error("EMAIL_TAKEN");

      const projects = await tx.project.findMany({
        where: { id: { in: invite.projectIds } },
        select: { id: true },
      });

      await tx.user.create({
        data: {
          name,
          email: invite.email,
          password: passwordHash,
          role: invite.role,
          menus: normalizeMenus(invite.menus, invite.role),
          projects: {
            create: projects.map((p) => ({ projectId: p.id, role: invite.role })),
          },
        },
      });
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "ALREADY_ACCEPTED") {
      return NextResponse.json(
        { error: "Undangan ini sudah dipakai. Silakan login.", accepted: true },
        { status: 410 }
      );
    }
    if (code === "EMAIL_TAKEN") {
      return NextResponse.json(
        { error: "Email ini sudah punya akun. Silakan login." },
        { status: 409 }
      );
    }
    console.error("[invite accept]", e);
    return NextResponse.json({ error: "Gagal membuat akun" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email: invite.email }, { status: 201 });
}

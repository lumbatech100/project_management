import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeMenus } from "@/lib/menus";
import { MOBILE_SESSION_MAX_AGE_SEC, signMobileToken } from "@/lib/mobile-auth";
import { createAuthSession } from "@/lib/auth-session";
import { verifyPassword } from "@/lib/password";
import { checkLoginAttempt, clearLoginAttempts } from "@/lib/rate-limit";

/**
 * POST /api/mobile/login
 * Body: { email, password }
 * → { token, user }
 */
export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email dan password wajib" },
      { status: 400 }
    );
  }

  const limit = checkLoginAttempt(email, req.headers);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(
          limit.retryAfterSec / 60
        )} menit.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await verifyPassword(password, user?.password);
  if (!user || !valid) {
    return NextResponse.json(
      { error: "Email atau password salah" },
      { status: 401 }
    );
  }
  clearLoginAttempts(email);

  const menus = normalizeMenus(user.menus, user.role);
  const sid = await createAuthSession(
    user.id,
    "mobile",
    MOBILE_SESSION_MAX_AGE_SEC
  );
  const token = await signMobileToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    menus,
    sid,
  });

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      menus,
    },
  });
}

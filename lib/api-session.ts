import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { authOptions } from "./auth";
import { verifyMobileToken } from "./mobile-auth";
import { normalizeMenus, type MenuKey } from "./menus";
import { prisma } from "./prisma";
import { getActiveAuthSession } from "./auth-session";

export type ApiUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: Role;
  menus: MenuKey[];
};

export type ApiSession = {
  user: ApiUser;
};

/**
 * Session untuk API: cookie NextAuth (web) ATAU Bearer JWT (mobile).
 * Privilege menus selalu di-refresh dari DB agar centang hak akses langsung berlaku.
 */
export async function getApiSession(
  req?: NextRequest
): Promise<ApiSession | null> {
  if (req) {
    const header = req.headers.get("authorization") || "";
    if (header.toLowerCase().startsWith("bearer ")) {
      const token = header.slice(7).trim();
      if (token) {
        const mobile = await verifyMobileToken(token);
        if (mobile) {
          const dbUser = await getActiveAuthSession(mobile.sid, mobile.id);
          if (!dbUser) return null;
          return {
            user: {
              id: mobile.id,
              name: dbUser.name,
              email: dbUser.email,
              role: dbUser.role,
              menus: normalizeMenus(dbUser.menus, dbUser.role),
            },
          };
        }
      }
    }
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  let role = session.user.role;
  let menus = session.user.menus || [];
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, menus: true },
    });
    if (!dbUser) return null;
    role = dbUser.role;
    menus = normalizeMenus(dbUser.menus, dbUser.role);
  } catch {
    menus = normalizeMenus(menus, role);
  }

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role,
      menus,
    },
  };
}

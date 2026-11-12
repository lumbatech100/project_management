import { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import { verifyPassword } from "./password";
import { checkLoginAttempt, clearLoginAttempts } from "./rate-limit";
import type { Role } from "@prisma/client";
import { normalizeMenus, type MenuKey } from "./menus";
import {
  SESSION_REVOKED,
  WEB_SESSION_MAX_AGE_SEC,
  createAuthSession,
  getActiveAuthSession,
  revokeAuthSession,
} from "./auth-session";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: Role;
      menus: MenuKey[];
    };
  }

  interface User {
    role: Role;
    menus: MenuKey[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    menus: MenuKey[];
    /** id AuthSession — dicek tiap request supaya logout benar-benar mencabut token */
    sid?: string;
  }
}

function isRevokedSessionError(metadata: unknown) {
  const err =
    metadata && typeof metadata === "object" && "error" in metadata
      ? (metadata as { error: unknown }).error
      : metadata;
  return err instanceof Error && err.message === SESSION_REVOKED;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: WEB_SESSION_MAX_AGE_SEC },
  logger: {
    error(code, metadata) {
      if (code === "JWT_SESSION_ERROR" && isRevokedSessionError(metadata)) {
        return;
      }
      console.error(`[next-auth][error][${code}]`, metadata);
    },
  },
  events: {
    async signOut({ token }) {
      await revokeAuthSession(token?.sid);
    },
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const limit = checkLoginAttempt(credentials.email, req?.headers);
        if (!limit.ok) {
          throw new Error(
            `Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(
              limit.retryAfterSec / 60
            )} menit.`
          );
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        const valid = await verifyPassword(credentials.password, user?.password);
        if (!user || !valid) return null;

        clearLoginAttempts(credentials.email);
        const menus = normalizeMenus(user.menus, user.role);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          menus,
        };
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/") && !url.startsWith("//")) {
        return `${baseUrl}${url}`;
      }
      try {
        const target = new URL(url);
        if (target.origin === new URL(baseUrl).origin) {
          return url;
        }
        return baseUrl;
      } catch {
        return baseUrl;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.menus = user.menus;
        token.sid = await createAuthSession(
          user.id,
          "web",
          WEB_SESSION_MAX_AGE_SEC
        );
      }

      // Tolak token yang sesinya sudah logout/dicabut, sekaligus refresh
      // privilege dari DB supaya perubahan Admin langsung berlaku.
      const dbUser = await getActiveAuthSession(token.sid, token.id);
      if (!dbUser) throw new Error(SESSION_REVOKED);
      token.role = dbUser.role;
      token.menus = normalizeMenus(dbUser.menus, dbUser.role);

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.menus = token.menus || [];
      }
      return session;
    },
  },
};

/** Session dengan privilege menus terbaru dari DB (hak akses Admin langsung aktif). */
export async function getSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return session;

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, menus: true },
    });
    if (!dbUser) return null;
    session.user.role = dbUser.role;
    session.user.menus = normalizeMenus(dbUser.menus, dbUser.role);
  } catch {
    // keep token menus
  }
  return session;
}

/** @deprecated alias — getSession sudah fresh dari DB */
export async function getFreshSession() {
  return getSession();
}

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session;
}

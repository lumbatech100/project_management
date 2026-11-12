import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";
import type { MenuKey } from "./menus";

const ISSUER = "simplo-mobile";
const AUDIENCE = "simplo-app";
/** 30 hari — device lapangan online-first, tetap perlu re-login berkala */
export const MOBILE_SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;
const EXPIRES_IN = `${MOBILE_SESSION_MAX_AGE_SEC}s`;

export type MobileTokenPayload = {
  id: string;
  name: string;
  email: string;
  role: Role;
  menus: MenuKey[];
  /** id AuthSession — token ditolak setelah logout / dicabut */
  sid: string;
};

function secretKey() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function signMobileToken(payload: MobileTokenPayload) {
  return new SignJWT({
    name: payload.name,
    email: payload.email,
    role: payload.role,
    menus: payload.menus,
    sid: payload.sid,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(EXPIRES_IN)
    .sign(secretKey());
}

export async function verifyMobileToken(
  token: string
): Promise<MobileTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const id = typeof payload.sub === "string" ? payload.sub : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    const role = payload.role as Role | undefined;
    const sid = typeof payload.sid === "string" ? payload.sid : null;
    if (!id || !email || !role || !sid) return null;

    return {
      id,
      name: typeof payload.name === "string" ? payload.name : email,
      email,
      role,
      sid,
      menus: Array.isArray(payload.menus)
        ? (payload.menus as MenuKey[])
        : [],
    };
  } catch {
    return null;
  }
}

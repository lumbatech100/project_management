import { NextRequest, NextResponse } from "next/server";
import { verifyMobileToken } from "@/lib/mobile-auth";
import { revokeAuthSession } from "@/lib/auth-session";

/**
 * POST /api/mobile/logout
 * Header: Authorization: Bearer <token> → token langsung tidak berlaku lagi.
 */
export async function POST(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const mobile = await verifyMobileToken(header.slice(7).trim());
  if (!mobile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await revokeAuthSession(mobile.sid);
  return NextResponse.json({ ok: true });
}

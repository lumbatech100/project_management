import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { withAuth, type NextRequestWithAuth } from "next-auth/middleware";
import { verifyMobileToken } from "@/lib/mobile-auth";

/**
 * Middleware halaman hanya cek login.
 * Hak akses menu dicek di page/API lewat session yang di-refresh dari DB,
 * supaya centang privilege Admin langsung berlaku (JWT di cookie sering stale).
 */
const pageAuth = withAuth({
  pages: { signIn: "/login" },
  callbacks: {
    authorized: ({ token }) => !!token,
  },
});

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** API yang boleh dibaca Client: Progress Lapangan + Progress Kumulatif + Blocker. */
const CLIENT_READABLE_API = [
  /^\/api\/project\/?$/,
  /^\/api\/project\/[^/]+\/?$/,
  /^\/api\/project\/[^/]+\/floor(\/.*)?$/,
  /^\/api\/project\/[^/]+\/marker\/.+$/,
  /^\/api\/project\/[^/]+\/daily-report(\/.*)?$/,
  /^\/api\/project\/[^/]+\/po(\/.*)?$/,
  /^\/api\/project\/[^/]+\/blocker(\/.*)?$/,
];

/** Client boleh komentar di isu blocker. Close tetap ditolak di route (Admin saja). */
const CLIENT_BLOCKER_COMMENT =
  /^\/api\/project\/[^/]+\/blocker\/[^/]+$/;

async function requestRole(req: NextRequest): Promise<unknown> {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return (await verifyMobileToken(auth.slice(7).trim()))?.role;
  }
  return (await getToken({ req }))?.role;
}

/**
 * Client = view-only: semua request tulis ke API project ditolak, dan baca
 * hanya untuk data Progress (bukan Cost, Pekerja, Dokumen, Inventory, dll).
 */
async function guardClientApi(req: NextRequest) {
  if ((await requestRole(req)) !== "CLIENT") return NextResponse.next();

  const path = req.nextUrl.pathname;
  const readable =
    (READ_METHODS.has(req.method) &&
      CLIENT_READABLE_API.some((re) => re.test(path))) ||
    (req.method === "POST" && CLIENT_BLOCKER_COMMENT.test(path));
  if (!readable) {
    return NextResponse.json(
      { error: "Akun client hanya bisa melihat progress (view-only)" },
      { status: 403 }
    );
  }
  return NextResponse.next();
}

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  // public/uploads jangan pernah disajikan statis tanpa cek login.
  if (req.nextUrl.pathname.startsWith("/uploads/")) {
    const url = req.nextUrl.clone();
    url.pathname = `/api${req.nextUrl.pathname}`;
    return NextResponse.rewrite(url);
  }
  if (req.nextUrl.pathname.startsWith("/api/project")) {
    return guardClientApi(req);
  }
  return pageAuth(req as NextRequestWithAuth, event);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/project/:path*",
    "/user/:path*",
    "/setting/:path*",
    "/api/project/:path*",
    "/uploads/:path*",
  ],
};

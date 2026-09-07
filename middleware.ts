import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const PROJECT_SEGS = [
  "overview",
  "progress",
  "timeline",
  "laporan",
  "cost",
  "inventory",
  "absen",
  "pekerja",
  "details",
] as const;

function firstMainPath(menus: string[]) {
  if (menus.includes("main.dashboard")) return "/dashboard";
  if (menus.includes("main.project")) return "/project";
  if (menus.includes("main.setting")) return "/setting";
  return "/project";
}

function firstProjectSeg(menus: string[]) {
  for (const seg of PROJECT_SEGS) {
    if (menus.includes(`project.${seg}`)) return seg;
  }
  return "progress";
}

export default withAuth(
  function middleware(req) {
    const menus = (req.nextauth.token?.menus as string[] | undefined) || [];
    const path = req.nextUrl.pathname;

    const need = (key: string) => menus.includes(key);

    if (path.startsWith("/dashboard") && !need("main.dashboard")) {
      return NextResponse.redirect(new URL(firstMainPath(menus), req.url));
    }
    if (path.startsWith("/user") && !need("main.user")) {
      return NextResponse.redirect(new URL(firstMainPath(menus), req.url));
    }
    if (path.startsWith("/setting") && !need("main.setting")) {
      return NextResponse.redirect(new URL(firstMainPath(menus), req.url));
    }

    // /project list
    if (path === "/project" && !need("main.project")) {
      return NextResponse.redirect(new URL(firstMainPath(menus), req.url));
    }

    const match = path.match(/^\/project\/([^/]+)(?:\/(.*))?$/);
    if (match) {
      const projectId = match[1];
      const rest = (match[2] || "").split("/")[0] || "";

      if (!need("main.project")) {
        return NextResponse.redirect(new URL(firstMainPath(menus), req.url));
      }

      const fallback = firstProjectSeg(menus);

      if (!rest) {
        return NextResponse.redirect(
          new URL(`/project/${projectId}/${fallback}`, req.url)
        );
      }

      const menuKey = `project.${rest}`;
      if (PROJECT_SEGS.includes(rest as (typeof PROJECT_SEGS)[number])) {
        if (!need(menuKey)) {
          return NextResponse.redirect(
            new URL(`/project/${projectId}/${fallback}`, req.url)
          );
        }
      }
    }

    return NextResponse.next();
  },
  {
    pages: { signIn: "/login" },
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/project/:path*",
    "/user/:path*",
    "/setting/:path*",
  ],
};

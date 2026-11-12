import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "fs";
import path from "path";
import { Readable } from "stream";
import { getApiSession } from "@/lib/api-session";
import { hasMenu, type MenuKey } from "@/lib/menus";
import { canAccessProject, logAccessDenied } from "@/lib/project-access";
import { findUploadOwner } from "@/lib/upload-owner";

type Params = { params: Promise<{ filename: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** File sensitif (prefix dari lib/storage callers) hanya untuk user dengan menu terkait. */
const RESTRICTED_PREFIXES: { prefix: string; menu: MenuKey }[] = [
  { prefix: "worker-ktp-", menu: "project.pekerja" },
  { prefix: "worker-selfie-", menu: "project.pekerja" },
  { prefix: "doc-", menu: "project.dokumen" },
  { prefix: "cost-", menu: "project.cost" },
  { prefix: "gsj-", menu: "project.inventory" },
];

export async function GET(req: NextRequest, props: Params) {
  const params = await props.params;
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filename = path.basename(params.filename);
  if (!filename || filename !== params.filename) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  if (session.user.role !== "ADMIN") {
    const owner = await findUploadOwner(filename);
    const restricted = RESTRICTED_PREFIXES.find((r) =>
      filename.startsWith(r.prefix)
    );
    const menu = owner?.menu ?? restricted?.menu ?? null;
    const menus = menu == null ? [] : Array.isArray(menu) ? menu : [menu];
    const allowed =
      !!owner &&
      (await canAccessProject(session.user.id, session.user.role, owner.projectId)) &&
      (menus.length === 0 || menus.some((m) => hasMenu(session.user.menus, m)));
    if (!allowed) {
      logAccessDenied("file", session.user.id, session.user.role, filename);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const ext = path.extname(filename).toLowerCase();
  if (!MIME[ext]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), "public", "uploads", filename);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stat = statSync(filePath);
  const stream = createReadStream(filePath);
  const webStream = Readable.toWeb(stream) as ReadableStream;

  const mime = MIME[ext];
  const inline =
    mime.startsWith("image/") || mime === "application/pdf";

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": inline
        ? `inline; filename="${filename}"`
        : `attachment; filename="${filename}"`,
    },
  });
}

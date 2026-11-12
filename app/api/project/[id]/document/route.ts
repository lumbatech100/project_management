import { NextRequest, NextResponse } from "next/server";
import type { DocumentCategory } from "@prisma/client";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, forbidUnlessMenu } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import {
  deleteUploadByUrl,
  saveProjectDocumentFile,
} from "@/lib/storage";
import { canManageDocuments } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };

const CATEGORIES = new Set<DocumentCategory>([
  "PERJANJIAN",
  "TENDER",
  "KONTRAK",
  "LEGAL",
  "TEKNIS",
  "LAINNYA",
]);

function parseCategory(v: unknown): DocumentCategory {
  if (typeof v === "string" && CATEGORIES.has(v as DocumentCategory)) {
    return v as DocumentCategory;
  }
  return "LAINNYA";
}

/** GET — daftar dokumen project */
export async function GET(req: NextRequest, props: Params) {
  const params = await props.params;
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await forbidUnlessProjectAccess(
    session.user.id,
    session.user.role,
    params.id
  );
  if (denied) return denied;
  const noMenu = forbidUnlessMenu(session.user, "project.dokumen");
  if (noMenu) return noMenu;

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const documents = await prisma.projectDocument.findMany({
    where: { projectId: params.id },
    orderBy: [{ category: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ documents });
}

/** POST — upload dokumen (multipart: file, title, category, description?) */
export async function POST(req: NextRequest, props: Params) {
  const params = await props.params;
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await forbidUnlessProjectAccess(
    session.user.id,
    session.user.role,
    params.id
  );
  if (denied) return denied;
  if (!canManageDocuments(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Upload tidak valid (max 25MB)" },
      { status: 413 }
    );
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "File wajib" }, { status: 400 });
  }

  const title =
    String(form.get("title") || "").trim() ||
    file.name.replace(/\.[^.]+$/, "") ||
    "Dokumen";
  const category = parseCategory(form.get("category"));
  const description = String(form.get("description") || "").trim() || null;
  const who = session.user.name || session.user.email || "User";

  let saved: Awaited<ReturnType<typeof saveProjectDocumentFile>>;
  try {
    saved = await saveProjectDocumentFile(file, `doc-${params.id}`);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal upload" },
      { status: 400 }
    );
  }

  try {
    const doc = await prisma.projectDocument.create({
      data: {
        projectId: params.id,
        title,
        category,
        description,
        fileUrl: saved.url,
        fileName: saved.filename,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        uploadedBy: who,
      },
    });
    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    // DB gagal setelah file sudah tersimpan — hapus lagi supaya tidak nyangkut
    // yatim di disk.
    console.error("[document create] failed", err);
    await deleteUploadByUrl(saved.url);
    return NextResponse.json(
      { error: "Gagal menyimpan dokumen. Coba lagi." },
      { status: 500 }
    );
  }
}

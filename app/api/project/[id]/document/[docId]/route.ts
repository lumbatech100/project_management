import { NextRequest, NextResponse } from "next/server";
import type { DocumentCategory } from "@prisma/client";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { deleteUploadByUrl } from "@/lib/storage";
import { canManageDocuments } from "@/lib/utils";

type Params = { params: Promise<{ id: string; docId: string }> };

const CATEGORIES = new Set<DocumentCategory>([
  "PERJANJIAN",
  "TENDER",
  "KONTRAK",
  "LEGAL",
  "TEKNIS",
  "LAINNYA",
]);

/** PATCH — update metadata (title, category, description) */
export async function PATCH(req: NextRequest, props: Params) {
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

  const existing = await prisma.projectDocument.findFirst({
    where: { id: params.docId, projectId: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const data: {
    title?: string;
    category?: DocumentCategory;
    description?: string | null;
  } = {};

  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }
  if (
    typeof body.category === "string" &&
    CATEGORIES.has(body.category as DocumentCategory)
  ) {
    data.category = body.category as DocumentCategory;
  }
  if (body.description !== undefined) {
    data.description =
      typeof body.description === "string"
        ? body.description.trim() || null
        : null;
  }

  const updated = await prisma.projectDocument.update({
    where: { id: existing.id },
    data,
  });
  return NextResponse.json(updated);
}

/** DELETE — hapus dokumen + file */
export async function DELETE(req: NextRequest, props: Params) {
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

  const existing = await prisma.projectDocument.findFirst({
    where: { id: params.docId, projectId: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await deleteUploadByUrl(existing.fileUrl);
  await prisma.projectDocument.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}

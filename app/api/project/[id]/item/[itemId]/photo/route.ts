import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import {
  deleteUploadByUrl,
  MAX_EVIDENCE_PHOTOS,
  saveEvidencePhoto,
} from "@/lib/storage";
import { canApproveProgress, canSubmitProgress } from "@/lib/utils";

type Params = { params: Promise<{ id: string; itemId: string }> };

async function getItem(projectId: string, itemId: string) {
  return prisma.breakdownItem.findFirst({
    where: {
      id: itemId,
      marker: { floor: { projectId } },
    },
  });
}

/** POST — Leader upload foto bukti breakdown */
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
  if (!canSubmitProgress(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const item = await getItem(params.id, params.itemId);
  if (!item) {
    return NextResponse.json({ error: "Item tidak ditemukan" }, { status: 404 });
  }
  if (item.status === "APPROVED") {
    return NextResponse.json(
      { error: "Item sudah approved, foto tidak bisa diubah" },
      { status: 409 }
    );
  }
  if (item.photoUrls.length >= MAX_EVIDENCE_PHOTOS) {
    return NextResponse.json(
      { error: `Maksimal ${MAX_EVIDENCE_PHOTOS} foto per item` },
      { status: 400 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Upload tidak valid" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "File wajib" }, { status: 400 });
  }

  let url: string;
  try {
    const saved = await saveEvidencePhoto(file, `item-${item.id}`);
    url = saved.url;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal upload" },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.breakdownItem.update({
      where: { id: item.id },
      data: { photoUrls: { push: url } },
    });
    return NextResponse.json(updated);
  } catch (err) {
    // DB gagal setelah file sudah tersimpan — hapus lagi supaya tidak nyangkut
    // yatim di disk.
    console.error("[item photo] db update failed", err);
    await deleteUploadByUrl(url);
    return NextResponse.json(
      { error: "Gagal menyimpan foto. Coba lagi." },
      { status: 500 }
    );
  }
}

/** DELETE — hapus satu foto (?url=) — Leader, atau SM jika review */
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
  const role = session.user.role;
  const menus = session.user.menus;
  if (!canSubmitProgress(role, menus) && !canApproveProgress(role, menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const item = await getItem(params.id, params.itemId);
  if (!item) {
    return NextResponse.json({ error: "Item tidak ditemukan" }, { status: 404 });
  }
  if (item.status === "APPROVED" && canSubmitProgress(role, menus) && !canApproveProgress(role, menus)) {
    return NextResponse.json(
      { error: "Item sudah approved" },
      { status: 409 }
    );
  }

  const url = new URL(req.url).searchParams.get("url");
  if (!url || !item.photoUrls.includes(url)) {
    return NextResponse.json({ error: "Foto tidak ditemukan" }, { status: 404 });
  }

  await deleteUploadByUrl(url);
  const updated = await prisma.breakdownItem.update({
    where: { id: item.id },
    data: { photoUrls: item.photoUrls.filter((u) => u !== url) },
  });
  return NextResponse.json(updated);
}

import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canRecordDelivery } from "@/lib/utils";
import { saveReceiptFiles } from "@/lib/goods-receipt";
import { deleteUploadByUrl } from "@/lib/storage";
import {
  INVENTORY_MAX_FILES,
  InventoryError,
  applyNoteEffects,
  noteInclude,
  revertNoteEffects,
} from "@/lib/inventory";
import { lowStockIdSet, notifyIfNewLowStock } from "@/lib/low-stock-mail";

type Params = { params: Promise<{ id: string; noteId: string }> };

/** action=confirm (multipart + photos[] bila draft belum ada foto) | action=cancel */
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
  if (!canRecordDelivery(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let action = "";
  let files: File[] = [];
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Upload tidak valid" }, { status: 400 });
    }
    action = String(form.get("action") || "");
    files = form
      .getAll("photos")
      .filter((f): f is File => f instanceof File && f.size > 0);
  } else {
    const body = await req.json().catch(() => ({}));
    action = typeof body.action === "string" ? body.action : "";
  }

  const who = session.user.name || session.user.email || "User";
  const note = await prisma.deliveryNote.findFirst({
    where: { id: params.noteId, projectId: params.id },
    include: { lines: true },
  });
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (action === "confirm") {
    if (note.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Hanya draft yang bisa dikonfirmasi" },
        { status: 400 }
      );
    }
    if (files.length === 0 && note.photoUrls.length === 0) {
      return NextResponse.json(
        { error: "Foto surat jalan wajib diunggah sebelum konfirmasi" },
        { status: 400 }
      );
    }
    if (files.length > INVENTORY_MAX_FILES) {
      return NextResponse.json(
        { error: `Maksimal ${INVENTORY_MAX_FILES} foto` },
        { status: 400 }
      );
    }
    let newUrls: string[] = [];
    try {
      newUrls = await saveReceiptFiles(files, params.id, "isj");
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Gagal simpan foto" },
        { status: 400 }
      );
    }

    try {
      const stockBefore = await lowStockIdSet(params.id);
      const updated = await prisma.$transaction(async (tx) => {
        const claimed = await tx.deliveryNote.updateMany({
          where: { id: note.id, status: "DRAFT" },
          data: {
            status: "CONFIRMED",
            confirmedAt: new Date(),
            confirmedBy: who,
            photoUrls: [...note.photoUrls, ...newUrls],
          },
        });
        if (claimed.count === 0) {
          throw new InventoryError("Surat jalan sudah diproses");
        }
        await applyNoteEffects(
          tx,
          { ...note, photoUrls: [...note.photoUrls, ...newUrls] },
          who
        );
        return tx.deliveryNote.findUniqueOrThrow({
          where: { id: note.id },
          include: noteInclude,
        });
      });
      await notifyIfNewLowStock(params.id, stockBefore);
      return NextResponse.json(updated);
    } catch (err) {
      await Promise.all(newUrls.map((u) => deleteUploadByUrl(u)));
      if (err instanceof InventoryError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  }

  if (action === "cancel") {
    if (note.status === "CANCELLED") {
      return NextResponse.json({ error: "Sudah dibatalkan" }, { status: 400 });
    }
    try {
      const stockBefore = await lowStockIdSet(params.id);
      const updated = await prisma.$transaction(async (tx) => {
        const claimed = await tx.deliveryNote.updateMany({
          where: { id: note.id, status: note.status },
          data: { status: "CANCELLED" },
        });
        if (claimed.count === 0) {
          throw new InventoryError("Surat jalan sudah diproses");
        }
        if (note.status === "CONFIRMED") await revertNoteEffects(tx, note);
        return tx.deliveryNote.findUniqueOrThrow({
          where: { id: note.id },
          include: noteInclude,
        });
      });
      await notifyIfNewLowStock(params.id, stockBefore);
      return NextResponse.json(updated);
    } catch (err) {
      if (err instanceof InventoryError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  }

  return NextResponse.json(
    { error: "Action tidak valid (confirm|cancel)" },
    { status: 400 }
  );
}

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
  if (!canRecordDelivery(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const note = await prisma.deliveryNote.findFirst({
    where: { id: params.noteId, projectId: params.id },
  });
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (note.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Hanya draft yang bisa dihapus. Gunakan batalkan untuk confirmed." },
      { status: 409 }
    );
  }

  await prisma.deliveryNote.delete({ where: { id: note.id } });
  await Promise.all(note.photoUrls.map((u) => deleteUploadByUrl(u)));
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import type { InventoryCategory, OutDestination } from "@prisma/client";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, forbidUnlessMenu } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canRecordDelivery } from "@/lib/utils";
import { parseQty, parseText } from "@/lib/goods-checklist";
import { saveReceiptFiles } from "@/lib/goods-receipt";
import { deleteUploadByUrl } from "@/lib/storage";
import {
  DEFAULT_SUPPLIER,
  INVENTORY_MAX_FILES,
  INVENTORY_NUMBER_MAX,
  INVENTORY_PARTY_MAX,
  INVENTORY_TEXT_MAX,
  INVENTORY_VEHICLE_MAX,
  InventoryError,
  applyNoteEffects,
  nextOutNumber,
  noteInclude,
} from "@/lib/inventory";
import { formatDateKey, getJakartaTodayDate, parseRecordDate } from "@/lib/workday";
import { lowStockIdSet, notifyIfNewLowStock } from "@/lib/low-stock-mail";

type Params = { params: Promise<{ id: string }> };

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
  const noMenu = forbidUnlessMenu(session.user, "project.inventory");
  if (noMenu) return noMenu;

  const notes = await prisma.deliveryNote.findMany({
    where: { projectId: params.id },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: noteInclude,
  });
  return NextResponse.json({ notes });
}

type RawBody = {
  direction?: unknown;
  category?: unknown;
  destination?: unknown;
  number?: unknown;
  date?: unknown;
  partyName?: unknown;
  vehicleNo?: unknown;
  notes?: unknown;
  lines?: unknown;
};

/**
 * Barang masuk (IN): SJ dari supplier + foto wajib → langsung confirmed.
 * Barang keluar (OUT): SJ dirilis gudang; dengan foto → confirmed, tanpa foto → draft (cetak dulu).
 * Multipart: field di atas + `lines` (JSON) + `photos[]`. JSON tetap diterima (tanpa foto).
 */
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

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, createdAt: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: RawBody;
  let files: File[] = [];
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Upload tidak valid" }, { status: 400 });
    }
    const field = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" ? v : undefined;
    };
    let lines: unknown;
    try {
      lines = JSON.parse(field("lines") || "[]");
    } catch {
      return NextResponse.json({ error: "Daftar barang tidak valid" }, { status: 400 });
    }
    body = {
      direction: field("direction"),
      category: field("category"),
      destination: field("destination"),
      number: field("number"),
      date: field("date"),
      partyName: field("partyName"),
      vehicleNo: field("vehicleNo"),
      notes: field("notes"),
      lines,
    };
    files = form
      .getAll("photos")
      .filter((f): f is File => f instanceof File && f.size > 0);
  } else {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
    }
  }

  const direction = body.direction;
  if (direction !== "IN" && direction !== "OUT") {
    return NextResponse.json(
      { error: "Arah surat jalan harus IN atau OUT" },
      { status: 400 }
    );
  }

  let category: InventoryCategory | null = null;
  let destination: OutDestination | null = null;
  if (direction === "IN") {
    category = body.category === "MAIN" ? "MAIN" : "SUPPORT";
  } else {
    if (body.destination !== "SITE" && body.destination !== "OFFICE") {
      return NextResponse.json(
        { error: "Tujuan keluar wajib: Site atau Retur ke office" },
        { status: 400 }
      );
    }
    destination = body.destination;
  }

  const notes = parseText(body.notes, INVENTORY_TEXT_MAX);
  const partyName = parseText(body.partyName, INVENTORY_PARTY_MAX);
  const vehicleNo = parseText(body.vehicleNo, INVENTORY_VEHICLE_MAX);
  if (
    (notes === undefined && body.notes !== undefined) ||
    (partyName === undefined && body.partyName !== undefined) ||
    (vehicleNo === undefined && body.vehicleNo !== undefined)
  ) {
    return NextResponse.json({ error: "Isian terlalu panjang" }, { status: 400 });
  }

  let number: string;
  if (direction === "IN") {
    const n = parseText(body.number, INVENTORY_NUMBER_MAX);
    if (!n) {
      return NextResponse.json(
        { error: "Nomor surat jalan dari supplier wajib diisi" },
        { status: 400 }
      );
    }
    number = n;
  } else {
    number = await nextOutNumber(params.id);
  }

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const lines: { itemId: string; quantity: number; notes: string | null }[] = [];
  for (const raw of rawLines) {
    const itemId = typeof raw?.itemId === "string" ? raw.itemId : "";
    const quantity = parseQty(raw?.quantity, true);
    if (!itemId || quantity == null) continue;
    if (lines.some((l) => l.itemId === itemId)) {
      return NextResponse.json({ error: "Barang tercantum dua kali" }, { status: 400 });
    }
    const lineNotes = parseText(raw?.notes, INVENTORY_TEXT_MAX);
    lines.push({ itemId, quantity, notes: lineNotes ?? null });
  }
  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Minimal 1 baris barang dengan qty > 0" },
      { status: 400 }
    );
  }

  const items = await prisma.inventoryItem.findMany({
    where: { projectId: params.id, id: { in: lines.map((l) => l.itemId) } },
    select: { id: true, name: true, category: true },
  });
  if (items.length !== lines.length) {
    return NextResponse.json(
      { error: "Ada barang yang tidak valid di project ini" },
      { status: 400 }
    );
  }
  if (category) {
    const wrong = items.find((i) => i.category !== category);
    if (wrong) {
      return NextResponse.json(
        {
          error:
            category === "MAIN"
              ? `${wrong.name} bukan barang dari list PO`
              : `${wrong.name} adalah barang PO — catat di Perangkat & Material utama`,
        },
        { status: 400 }
      );
    }
  }

  const dateStr =
    typeof body.date === "string" && body.date
      ? body.date.slice(0, 10)
      : formatDateKey(getJakartaTodayDate());
  const parsedDate = parseRecordDate(dateStr, project.createdAt);
  if ("error" in parsedDate) {
    return NextResponse.json({ error: parsedDate.error }, { status: 400 });
  }

  if (direction === "IN" && files.length === 0) {
    return NextResponse.json(
      { error: "Foto surat jalan wajib diunggah" },
      { status: 400 }
    );
  }
  if (files.length > INVENTORY_MAX_FILES) {
    return NextResponse.json(
      { error: `Maksimal ${INVENTORY_MAX_FILES} foto` },
      { status: 400 }
    );
  }

  let photoUrls: string[] = [];
  try {
    photoUrls = await saveReceiptFiles(files, params.id, "isj");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal simpan foto" },
      { status: 400 }
    );
  }

  const who = session.user.name || session.user.email || "User";
  const confirmNow = photoUrls.length > 0;

  try {
    const stockBefore = await lowStockIdSet(params.id);
  const note = await prisma.$transaction(async (tx) => {
      const created = await tx.deliveryNote.create({
        data: {
          projectId: params.id,
          number,
          direction,
          category,
          destination,
          status: confirmNow ? "CONFIRMED" : "DRAFT",
          date: parsedDate.date,
          partyName:
            partyName ?? (direction === "IN" ? DEFAULT_SUPPLIER : null),
          vehicleNo: vehicleNo ?? null,
          notes: notes ?? null,
          photoUrls,
          createdBy: who,
          confirmedAt: confirmNow ? new Date() : null,
          confirmedBy: confirmNow ? who : null,
          lines: { create: lines },
        },
        include: { lines: true },
      });
      if (confirmNow) await applyNoteEffects(tx, created, who);
      return tx.deliveryNote.findUniqueOrThrow({
        where: { id: created.id },
        include: noteInclude,
      });
    });
    if (note.status === "CONFIRMED") await notifyIfNewLowStock(params.id, stockBefore);
    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    await Promise.all(photoUrls.map((u) => deleteUploadByUrl(u)));
    if (err instanceof InventoryError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: `Nomor surat jalan ${number} sudah pernah dicatat` },
        { status: 409 }
      );
    }
    throw err;
  }
}

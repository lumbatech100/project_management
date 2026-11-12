import { NextRequest, NextResponse } from "next/server";
import { getApiSession, type ApiSession } from "@/lib/api-session";
import { forbidUnlessMenu, forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canRecordDelivery } from "@/lib/utils";
import {
  GOODS_NOTES_MAX,
  RECEIPT_MAX_FILES,
  RECEIPT_NUMBER_MAX,
  isComplete,
  parseQty,
  parseText,
} from "@/lib/goods-checklist";
import { receiptInclude, recomputeArrived, saveReceiptFiles } from "@/lib/goods-receipt";
import { deleteUploadByUrl } from "@/lib/storage";
import { parseRecordDate } from "@/lib/workday";

type Params = { params: Promise<{ id: string }> };

async function guard(
  req: NextRequest,
  projectId: string
): Promise<{ error: NextResponse } | { session: ApiSession }> {
  const session = await getApiSession(req);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const denied = await forbidUnlessProjectAccess(
    session.user.id,
    session.user.role,
    projectId
  );
  if (denied) return { error: denied };
  const noMenu = forbidUnlessMenu(session.user, "project.inventory");
  if (noMenu) return { error: noMenu };
  return { session };
}

export async function GET(req: NextRequest, props: Params) {
  const params = await props.params;
  const g = await guard(req, params.id);
  if (!("session" in g)) return g.error;

  const receipts = await prisma.goodsReceipt.findMany({
    where: { projectId: params.id },
    include: receiptInclude,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ receipts });
}

/** Catat surat jalan kedatangan: multipart number, date, notes, lines (JSON), files[] */
export async function POST(req: NextRequest, props: Params) {
  const params = await props.params;
  const g = await guard(req, params.id);
  if (!("session" in g)) return g.error;
  const { user } = g.session;
  if (!canRecordDelivery(user.role, user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { createdAt: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Kirim sebagai form dengan lampiran surat jalan" },
      { status: 400 }
    );
  }

  const number = parseText(form.get("number") ?? undefined, RECEIPT_NUMBER_MAX);
  if (!number) {
    return NextResponse.json(
      { error: `Nomor surat jalan wajib (maks ${RECEIPT_NUMBER_MAX} karakter)` },
      { status: 400 }
    );
  }
  const notes = parseText(form.get("notes") ?? undefined, GOODS_NOTES_MAX);
  if (notes === undefined && form.get("notes") != null) {
    return NextResponse.json(
      { error: `Catatan maks ${GOODS_NOTES_MAX} karakter` },
      { status: 400 }
    );
  }
  const parsedDate = parseRecordDate(String(form.get("date") || "").slice(0, 10), project.createdAt);
  if ("error" in parsedDate) {
    return NextResponse.json({ error: parsedDate.error }, { status: 400 });
  }

  let rawLines: unknown;
  try {
    rawLines = JSON.parse(String(form.get("lines") || "[]"));
  } catch {
    return NextResponse.json({ error: "Daftar barang tidak valid" }, { status: 400 });
  }
  if (!Array.isArray(rawLines)) {
    return NextResponse.json({ error: "Daftar barang tidak valid" }, { status: 400 });
  }
  const lines = new Map<string, number>();
  for (const raw of rawLines) {
    const itemId = typeof raw?.itemId === "string" ? raw.itemId : "";
    const qty = parseQty(raw?.qty, true);
    if (!itemId || qty == null) {
      return NextResponse.json(
        { error: "Qty setiap barang harus lebih dari 0" },
        { status: 400 }
      );
    }
    if (lines.has(itemId)) {
      return NextResponse.json({ error: "Barang tercantum dua kali" }, { status: 400 });
    }
    lines.set(itemId, qty);
  }
  if (lines.size === 0) {
    return NextResponse.json(
      { error: "Pilih minimal satu barang yang datang" },
      { status: 400 }
    );
  }

  const items = await prisma.goodsChecklistItem.findMany({
    where: { id: { in: [...lines.keys()] }, projectId: params.id },
    select: { id: true, name: true, unit: true, qty: true, arrivedQty: true },
  });
  if (items.length !== lines.size) {
    return NextResponse.json({ error: "Barang tidak ditemukan" }, { status: 404 });
  }
  for (const item of items) {
    const remaining = Math.max(0, item.qty - item.arrivedQty);
    if (isComplete(item.arrivedQty, item.qty)) {
      return NextResponse.json(
        { error: `${item.name} sudah sampai semua` },
        { status: 400 }
      );
    }
    if (lines.get(item.id)! > remaining + 1e-9) {
      return NextResponse.json(
        {
          error: `Qty ${item.name} melebihi sisa kebutuhan (${remaining.toLocaleString("id-ID")} ${item.unit})`,
        },
        { status: 400 }
      );
    }
  }

  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json(
      { error: "Lampiran surat jalan (foto/PDF) wajib diunggah" },
      { status: 400 }
    );
  }
  if (files.length > RECEIPT_MAX_FILES) {
    return NextResponse.json(
      { error: `Maksimal ${RECEIPT_MAX_FILES} lampiran` },
      { status: 400 }
    );
  }

  let attachmentUrls: string[];
  try {
    attachmentUrls = await saveReceiptFiles(files, params.id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal simpan lampiran" },
      { status: 400 }
    );
  }

  const who = user.name || user.email || "User";
  try {
    const receipt = await prisma.$transaction(async (tx) => {
      const created = await tx.goodsReceipt.create({
        data: {
          projectId: params.id,
          number,
          date: parsedDate.date,
          notes: notes ?? null,
          attachmentUrls,
          createdBy: who,
          lines: {
            create: [...lines].map(([itemId, qty]) => ({ itemId, qty })),
          },
        },
        include: receiptInclude,
      });
      await recomputeArrived(tx, [...lines.keys()], who);
      return created;
    });
    const updatedItems = await prisma.goodsChecklistItem.findMany({
      where: { id: { in: [...lines.keys()] } },
    });
    return NextResponse.json({ receipt, items: updatedItems }, { status: 201 });
  } catch (err) {
    await Promise.all(attachmentUrls.map((u) => deleteUploadByUrl(u)));
    throw err;
  }
}

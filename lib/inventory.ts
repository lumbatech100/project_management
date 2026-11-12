import type {
  DeliveryDirection,
  InventoryCategory,
  OutDestination,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const INVENTORY_NUMBER_MAX = 60;
export const INVENTORY_TEXT_MAX = 300;
export const INVENTORY_PARTY_MAX = 120;
export const INVENTORY_VEHICLE_MAX = 30;
export const INVENTORY_MAX_FILES = 5;
export const DEFAULT_SUPPLIER = "Lumbatech";
const EPS = 1e-9;

export const CATEGORY_LABEL: Record<InventoryCategory, string> = {
  MAIN: "Perangkat & Material utama",
  SUPPORT: "Material support",
};

export const DEST_LABEL: Record<OutDestination, string> = {
  SITE: "Site",
  OFFICE: "Retur ke office",
};

/** Error validasi bisnis — pesan aman ditampilkan ke user. */
export class InventoryError extends Error {}

export const noteInclude = {
  lines: {
    orderBy: [{ item: { sortOrder: "asc" as const } }, { id: "asc" as const }],
    include: {
      item: {
        select: { id: true, name: true, unit: true, code: true, category: true },
      },
    },
  },
} satisfies Prisma.DeliveryNoteInclude;

function nameKey(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Pastikan setiap line PO BARANG punya barang stok (kategori MAIN) dan urutan
 * barang MAIN mengikuti urutan PO. Line dengan nama sama (mis. battery yang
 * dipakai 2 panel) memakai satu barang stok yang sama.
 */
export async function syncPoInventoryItems(projectId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`inv-po-sync:${projectId}`}))`;

    const lines = await tx.poLine.findMany({
      where: { type: "BARANG", po: { projectId } },
      orderBy: [
        { po: { createdAt: "asc" } },
        { sortOrder: "asc" },
        { createdAt: "asc" },
      ],
      select: { id: true, name: true, code: true, unit: true, inventoryItemId: true },
    });
    if (lines.length === 0) return;

    const items = await tx.inventoryItem.findMany({
      where: { projectId },
      select: { id: true, name: true, category: true, sortOrder: true },
    });
    const byId = new Map(items.map((i) => [i.id, i]));
    const byName = new Map(items.map((i) => [nameKey(i.name), i]));

    const firstIndex = new Map<string, number>();
    for (const [idx, line] of lines.entries()) {
      let itemId =
        line.inventoryItemId && byId.has(line.inventoryItemId)
          ? line.inventoryItemId
          : null;
      if (!itemId) {
        let item = byName.get(nameKey(line.name));
        if (!item) {
          item = await tx.inventoryItem.create({
            data: {
              projectId,
              category: "MAIN",
              name: line.name.trim(),
              code: line.code,
              unit: line.unit,
              location: "Gudang Utama",
              sortOrder: idx + 1,
            },
            select: { id: true, name: true, category: true, sortOrder: true },
          });
          byId.set(item.id, item);
          byName.set(nameKey(item.name), item);
        }
        itemId = item.id;
        await tx.poLine.update({
          where: { id: line.id },
          data: { inventoryItemId: itemId },
        });
      }
      if (!firstIndex.has(itemId)) firstIndex.set(itemId, idx + 1);
    }

    for (const [itemId, sortOrder] of firstIndex) {
      const item = byId.get(itemId)!;
      if (item.category !== "MAIN" || item.sortOrder !== sortOrder) {
        await tx.inventoryItem.update({
          where: { id: itemId },
          data: { category: "MAIN", sortOrder },
        });
      }
    }
  });
}

export type PoLineStat = {
  id: string;
  poNumber: string;
  name: string;
  groupName: string | null;
  notes: string | null;
  qty: number;
  received: number;
};

/** Qty PO & kumulatif diterima per barang stok, line PO urut sesuai PO. */
export async function poStatsByItem(
  db: Prisma.TransactionClient | typeof prisma,
  projectId: string,
  itemIds?: string[]
) {
  const lines = await db.poLine.findMany({
    where: {
      type: "BARANG",
      po: { projectId },
      inventoryItemId: itemIds ? { in: itemIds } : { not: null },
    },
    orderBy: [
      { po: { createdAt: "asc" } },
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      name: true,
      groupName: true,
      notes: true,
      qty: true,
      inventoryItemId: true,
      po: { select: { number: true } },
    },
  });
  const sums = lines.length
    ? await db.poDelivery.groupBy({
        by: ["lineId"],
        where: { lineId: { in: lines.map((l) => l.id) } },
        _sum: { qty: true },
      })
    : [];
  const receivedByLine = new Map(sums.map((s) => [s.lineId, s._sum.qty ?? 0]));

  const map = new Map<
    string,
    { poQty: number; received: number; lines: PoLineStat[] }
  >();
  for (const l of lines) {
    const itemId = l.inventoryItemId!;
    const received = receivedByLine.get(l.id) ?? 0;
    const entry = map.get(itemId) ?? { poQty: 0, received: 0, lines: [] };
    entry.poQty += l.qty;
    entry.received += received;
    entry.lines.push({
      id: l.id,
      poNumber: l.po.number,
      name: l.name,
      groupName: l.groupName,
      notes: l.notes,
      qty: l.qty,
      received,
    });
    map.set(itemId, entry);
  }
  return map;
}

/** Isi sisa qty line PO berurutan; null bila qty melebihi total sisa PO. */
export function allocateToPoLines(
  lines: { id: string; qty: number; received: number }[],
  qty: number
): { lineId: string; qty: number }[] | null {
  let left = qty;
  const out: { lineId: string; qty: number }[] = [];
  for (const l of lines) {
    if (left <= EPS) break;
    const take = Math.min(left, Math.max(0, l.qty - l.received));
    if (take > EPS) {
      out.push({ lineId: l.id, qty: take });
      left -= take;
    }
  }
  return left > EPS ? null : out;
}

type NoteForEffects = {
  id: string;
  projectId: string;
  number: string;
  direction: DeliveryDirection;
  date: Date;
  notes: string | null;
  photoUrls: string[];
  lines: { id: string; itemId: string; quantity: number }[];
};

function qtyByItem(lines: NoteForEffects["lines"]) {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.quantity);
  return m;
}

async function assertStock(
  tx: Prisma.TransactionClient,
  need: Map<string, number>,
  message: (name: string, available: number) => string
) {
  const items = await tx.inventoryItem.findMany({
    where: { id: { in: [...need.keys()] } },
    select: { id: true, name: true, qty: true },
  });
  for (const item of items) {
    if (item.qty + EPS < need.get(item.id)!) {
      throw new InventoryError(message(item.name, item.qty));
    }
  }
}

/**
 * Terapkan surat jalan yang dikonfirmasi: stok gudang berubah, dan barang masuk
 * kategori PO tercatat ke kumulatif (PoDelivery) dengan validasi qty PO.
 */
export async function applyNoteEffects(
  tx: Prisma.TransactionClient,
  note: NoteForEffects,
  who: string
) {
  const need = qtyByItem(note.lines);

  if (note.direction === "OUT") {
    await assertStock(
      tx,
      need,
      (name, qty) => `Stok gudang tidak cukup untuk ${name} (tersedia ${qty})`
    );
    for (const [itemId, qty] of need) {
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { qty: { decrement: qty } },
      });
    }
    return;
  }

  const stats = await poStatsByItem(tx, note.projectId, [...need.keys()]);
  const allocated = new Map<string, number>();
  for (const line of note.lines) {
    const stat = stats.get(line.itemId);
    if (!stat) continue;
    const remainingLines = stat.lines.map((l) => ({
      ...l,
      received: l.received + (allocated.get(l.id) ?? 0),
    }));
    const parts = allocateToPoLines(remainingLines, line.quantity);
    if (!parts) {
      const item = await tx.inventoryItem.findUnique({
        where: { id: line.itemId },
        select: { name: true, unit: true },
      });
      const sisa = Math.max(
        0,
        remainingLines.reduce((s, l) => s + l.qty - l.received, 0)
      );
      throw new InventoryError(
        `Qty ${item?.name ?? "barang"} melebihi sisa PO (sisa ${sisa} ${item?.unit ?? ""})`.trim()
      );
    }
    for (const p of parts) {
      allocated.set(p.lineId, (allocated.get(p.lineId) ?? 0) + p.qty);
      await tx.poDelivery.create({
        data: {
          lineId: p.lineId,
          deliveryNoteLineId: line.id,
          date: note.date,
          qty: p.qty,
          suratJalan: note.number,
          notes: note.notes,
          photoUrls: note.photoUrls,
          createdBy: who,
        },
      });
    }
  }

  for (const [itemId, qty] of need) {
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { qty: { increment: qty }, location: "Gudang Utama" },
    });
  }
}

/** Balikkan efek surat jalan yang dibatalkan (stok + kumulatif PO). */
export async function revertNoteEffects(
  tx: Prisma.TransactionClient,
  note: NoteForEffects
) {
  const need = qtyByItem(note.lines);
  if (note.direction === "IN") {
    await assertStock(
      tx,
      need,
      (name, qty) =>
        `Tidak bisa dibatalkan: stok ${name} tinggal ${qty} (sebagian sudah keluar)`
    );
    await tx.poDelivery.deleteMany({
      where: { deliveryNoteLineId: { in: note.lines.map((l) => l.id) } },
    });
  }
  for (const [itemId, qty] of need) {
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { qty: { increment: note.direction === "IN" ? -qty : qty } },
    });
  }
}

export async function nextOutNumber(projectId: string) {
  const year = new Date().getFullYear();
  const prefix = `SJ-${year}-`;
  const latest = await prisma.deliveryNote.findFirst({
    where: { projectId, number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  let seq = 1;
  if (latest?.number) {
    const n = parseInt(latest.number.slice(prefix.length), 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

/** Total masuk/keluar (surat jalan confirmed) per barang. */
export async function movementTotals(projectId: string) {
  const lines = await prisma.deliveryNoteLine.findMany({
    where: { deliveryNote: { projectId, status: "CONFIRMED" } },
    select: {
      itemId: true,
      quantity: true,
      deliveryNote: { select: { direction: true } },
    },
  });
  const map = new Map<string, { inQty: number; outQty: number }>();
  for (const l of lines) {
    const t = map.get(l.itemId) ?? { inQty: 0, outQty: 0 };
    if (l.deliveryNote.direction === "IN") t.inQty += l.quantity;
    else t.outQty += l.quantity;
    map.set(l.itemId, t);
  }
  return map;
}

export function isLowStock(item: { qty: number; minQty: number | null }) {
  return item.minQty != null && item.qty <= item.minQty;
}

export async function lowStockItems(projectId: string) {
  const items = await prisma.inventoryItem.findMany({
    where: { projectId, minQty: { not: null } },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, unit: true, qty: true, minQty: true },
  });
  return items.filter(isLowStock);
}

export type StockCardRow = {
  noteId: string;
  date: Date;
  number: string;
  direction: DeliveryDirection;
  description: string;
  inQty: number;
  outQty: number;
  balance: number;
};

/** Kartu stok: riwayat masuk/keluar berurutan tanggal dengan saldo berjalan. */
export async function stockCard(itemId: string, currentQty: number) {
  const lines = await prisma.deliveryNoteLine.findMany({
    where: { itemId, deliveryNote: { status: "CONFIRMED" } },
    select: {
      quantity: true,
      deliveryNote: {
        select: {
          id: true,
          number: true,
          direction: true,
          destination: true,
          partyName: true,
          date: true,
          confirmedAt: true,
          createdAt: true,
        },
      },
    },
  });
  lines.sort((a, b) => {
    const na = a.deliveryNote;
    const nb = b.deliveryNote;
    return (
      na.date.getTime() - nb.date.getTime() ||
      (na.confirmedAt ?? na.createdAt).getTime() -
        (nb.confirmedAt ?? nb.createdAt).getTime()
    );
  });

  const net = lines.reduce(
    (s, l) =>
      s + (l.deliveryNote.direction === "IN" ? l.quantity : -l.quantity),
    0
  );
  const opening = currentQty - net;
  let balance = opening;
  const rows: StockCardRow[] = lines.map((l) => {
    const n = l.deliveryNote;
    const isIn = n.direction === "IN";
    balance += isIn ? l.quantity : -l.quantity;
    const description = isIn
      ? `Masuk dari ${n.partyName || "supplier"}`
      : `Keluar ke ${n.destination ? DEST_LABEL[n.destination] : "—"}${n.partyName ? ` · ${n.partyName}` : ""}`;
    return {
      noteId: n.id,
      date: n.date,
      number: n.number,
      direction: n.direction,
      description,
      inQty: isIn ? l.quantity : 0,
      outQty: isIn ? 0 : l.quantity,
      balance,
    };
  });
  return { opening, rows, closing: currentQty };
}

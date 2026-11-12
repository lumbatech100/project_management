import path from "path";
import type { Prisma } from "@prisma/client";
import { completionStamp } from "@/lib/goods-checklist";
import { prisma } from "@/lib/prisma";
import { deleteUploadByUrl, saveProjectDocumentFile } from "@/lib/storage";

const RECEIPT_EXT = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp"]);

export const receiptInclude = {
  lines: {
    select: {
      id: true,
      itemId: true,
      qty: true,
      item: { select: { name: true, unit: true } },
    },
  },
} satisfies Prisma.GoodsReceiptInclude;

/** Simpan lampiran surat jalan (foto/PDF). Gagal di tengah → file yang sudah tersimpan dihapus. */
export async function saveReceiptFiles(
  files: File[],
  projectId: string,
  prefix = "gsj"
) {
  const urls: string[] = [];
  try {
    for (const f of files) {
      const ext = path.extname(f.name || "").toLowerCase();
      if (ext && !RECEIPT_EXT.has(ext)) {
        throw new Error("Lampiran surat jalan harus foto (JPG/PNG/WebP) atau PDF");
      }
      const saved = await saveProjectDocumentFile(f, `${prefix}-${projectId}`);
      if (!RECEIPT_EXT.has(path.extname(saved.storedName).toLowerCase())) {
        await deleteUploadByUrl(saved.url);
        throw new Error("Lampiran surat jalan harus foto (JPG/PNG/WebP) atau PDF");
      }
      urls.push(saved.url);
    }
  } catch (err) {
    await Promise.all(urls.map((u) => deleteUploadByUrl(u)));
    throw err;
  }
  return urls;
}

/**
 * Qty sampai lokasi = total qty di surat jalan. Barang yang sudah sampai pasti sudah dibeli,
 * jadi qty dibeli ikut naik bila kurang.
 */
export async function recomputeArrived(
  tx: Prisma.TransactionClient,
  itemIds: string[],
  userName: string
) {
  if (itemIds.length === 0) return;
  const [items, sums] = await Promise.all([
    tx.goodsChecklistItem.findMany({ where: { id: { in: itemIds } } }),
    tx.goodsReceiptLine.groupBy({
      by: ["itemId"],
      where: { itemId: { in: itemIds } },
      _sum: { qty: true },
    }),
  ]);
  const arrivedById = new Map(sums.map((s) => [s.itemId, s._sum.qty ?? 0]));

  for (const item of items) {
    const arrivedQty = arrivedById.get(item.id) ?? 0;
    const purchasedQty = Math.max(item.purchasedQty, arrivedQty);
    const arrived = completionStamp(
      arrivedQty,
      item.qty,
      item.arrivedAt,
      item.arrivedBy,
      userName
    );
    const purchased = completionStamp(
      purchasedQty,
      item.qty,
      item.purchasedAt,
      item.purchasedBy,
      userName
    );
    await tx.goodsChecklistItem.update({
      where: { id: item.id },
      data: {
        arrivedQty,
        purchasedQty,
        arrivedAt: arrived.at,
        arrivedBy: arrived.by,
        purchasedAt: purchased.at,
        purchasedBy: purchased.by,
      },
    });
  }
}

/** Hapus surat jalan yang sudah tidak punya baris barang (mis. barangnya dihapus). */
export async function deleteEmptyReceipts(projectId: string) {
  const empty = await prisma.goodsReceipt.findMany({
    where: { projectId, lines: { none: {} } },
    select: { id: true, attachmentUrls: true },
  });
  if (empty.length === 0) return;
  await prisma.goodsReceipt.deleteMany({ where: { id: { in: empty.map((r) => r.id) } } });
  await Promise.all(empty.flatMap((r) => r.attachmentUrls.map((u) => deleteUploadByUrl(u))));
}

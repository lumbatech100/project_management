export const GOODS_NAME_MAX = 120;
export const GOODS_UNIT_MAX = 20;
export const GOODS_NOTES_MAX = 300;
export const RECEIPT_NUMBER_MAX = 60;
export const RECEIPT_MAX_FILES = 5;
export const RECEIPT_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
const QTY_MAX = 1_000_000_000;

export type GoodsReceiptRow = {
  id: string;
  number: string;
  date: Date | string;
  notes: string | null;
  attachmentUrls: string[];
  createdBy: string | null;
  createdAt: Date | string;
  lines: { id: string; itemId: string; qty: number; item: { name: string; unit: string } }[];
};

export type GoodsChecklistRow = {
  id: string;
  name: string;
  unit: string;
  qty: number;
  purchasedQty: number;
  arrivedQty: number;
  purchasedAt: Date | string | null;
  purchasedBy: string | null;
  arrivedAt: Date | string | null;
  arrivedBy: string | null;
  notes: string | null;
};

/** Qty ≥ 0 (atau > 0 bila `positive`); null bila tidak valid. */
export function parseQty(raw: unknown, positive = false): number | null {
  if (raw === "" || raw == null || typeof raw === "boolean") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > QTY_MAX) return null;
  if (positive && n === 0) return null;
  return n;
}

export function parseText(raw: unknown, max: number): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (s.length > max) return undefined;
  return s || null;
}

export function isComplete(done: number, needed: number) {
  return needed > 0 && done >= needed;
}

/**
 * Stempel waktu & nama saat qty mencapai kebutuhan; dikosongkan lagi bila turun.
 * Stempel lama dipertahankan selama tetap lengkap.
 */
export function completionStamp(
  done: number,
  needed: number,
  prevAt: Date | null,
  prevBy: string | null,
  userName: string
): { at: Date | null; by: string | null } {
  if (!isComplete(done, needed)) return { at: null, by: null };
  if (prevAt) return { at: prevAt, by: prevBy };
  return { at: new Date(), by: userName };
}

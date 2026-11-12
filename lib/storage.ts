import { existsSync, statSync } from "fs";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { optimizeEvidence } from "@/lib/image";
import { prisma } from "@/lib/prisma";

export function filenameFromUploadUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("/api/uploads/")) return url.slice("/api/uploads/".length);
  if (url.startsWith("/uploads/")) return url.slice("/uploads/".length);
  return null;
}

export function fileSizeBytes(url: string | null | undefined): number {
  const filename = filenameFromUploadUrl(url);
  if (!filename) return 0;
  const filePath = path.join(process.cwd(), "public", "uploads", filename);
  if (!existsSync(filePath)) return 0;
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
]);
const MAX_EVIDENCE_BYTES = 12 * 1024 * 1024;
export const MAX_EVIDENCE_PHOTOS = 5;

export async function saveEvidencePhoto(
  file: File,
  prefix: string
): Promise<{ url: string; filename: string }> {
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    throw new Error("Format foto harus JPG/PNG/WebP");
  }
  if (file.size > MAX_EVIDENCE_BYTES) {
    throw new Error("Ukuran foto maksimal 12MB");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const { buffer, ext } = await optimizeEvidence(bytes);
  const filename = `${prefix}-${Date.now()}${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), buffer);
  return { url: `/api/uploads/${filename}`, filename };
}

export async function deleteUploadByUrl(url: string | null | undefined) {
  const filename = filenameFromUploadUrl(url);
  if (!filename) return;
  try {
    await unlink(path.join(process.cwd(), "public", "uploads", filename));
  } catch {
    // ignore missing
  }
}

/** Hapus beberapa upload sekaligus, best-effort (dipakai buat rollback saat DB write gagal). */
export async function deleteUploads(urls: (string | null | undefined)[]) {
  await Promise.allSettled(urls.map((u) => deleteUploadByUrl(u)));
}

/**
 * Kumpulkan semua URL upload yang dimiliki satu project (drawing, foto bukti,
 * dokumen, nota, surat jalan, dll) — dipanggil SEBELUM project dihapus,
 * supaya file fisiknya bisa dibersihkan sesudah row-row-nya hilang dari DB.
 * Project delete tanpa ini membuat public/uploads terus bertambah selamanya.
 */
export async function collectProjectUploadUrls(
  projectId: string
): Promise<string[]> {
  const [
    project,
    floors,
    costItems,
    workers,
    documents,
    deliveryNotes,
    attendanceSheets,
    goodsReceipts,
    breakdownItems,
    markerReports,
    poDeliveries,
  ] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { timelinePdfUrl: true },
    }),
    prisma.floor.findMany({
      where: { projectId },
      select: { drawingUrl: true, drawingHiUrl: true },
    }),
    prisma.costItem.findMany({
      where: { projectId },
      select: { receiptUrl: true },
    }),
    prisma.worker.findMany({
      where: { projectId },
      select: { photoKtpUrl: true, photoSelfieUrl: true },
    }),
    prisma.projectDocument.findMany({
      where: { projectId },
      select: { fileUrl: true },
    }),
    prisma.deliveryNote.findMany({
      where: { projectId },
      select: { photoUrls: true },
    }),
    prisma.attendanceSheet.findMany({
      where: { projectId },
      select: { photoUrls: true },
    }),
    prisma.goodsReceipt.findMany({
      where: { projectId },
      select: { attachmentUrls: true },
    }),
    prisma.breakdownItem.findMany({
      where: { marker: { floor: { projectId } } },
      select: { photoUrls: true },
    }),
    prisma.markerDailyReport.findMany({
      where: { dailyReport: { projectId } },
      select: { blockerPhotos: true },
    }),
    prisma.poDelivery.findMany({
      where: { line: { po: { projectId } } },
      select: { photoUrls: true },
    }),
  ]);

  const urls: (string | null | undefined)[] = [
    project?.timelinePdfUrl,
    ...floors.flatMap((f) => [f.drawingUrl, f.drawingHiUrl]),
    ...costItems.map((c) => c.receiptUrl),
    ...workers.flatMap((w) => [w.photoKtpUrl, w.photoSelfieUrl]),
    ...documents.map((d) => d.fileUrl),
    ...deliveryNotes.flatMap((n) => n.photoUrls),
    ...attendanceSheets.flatMap((s) => s.photoUrls),
    ...goodsReceipts.flatMap((r) => r.attachmentUrls),
    ...breakdownItems.flatMap((i) => i.photoUrls),
    ...markerReports.flatMap((r) => r.blockerPhotos),
    ...poDeliveries.flatMap((d) => d.photoUrls),
  ];

  return urls.filter((u): u is string => !!u);
}

const DOC_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const DOCUMENT_ALLOWED_EXT = new Set(Object.keys(DOC_MIME));
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export function documentMimeForExt(ext: string): string | null {
  return DOC_MIME[ext.toLowerCase()] ?? null;
}

const ZIP_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_SIG = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const PDF_SIG = Buffer.from("%PDF-");

/**
 * Isi file harus cocok dengan ekstensinya — nama file dan MIME dari client bisa dipalsukan.
 * Gambar tidak dicek di sini karena selalu di-encode ulang.
 */
export function matchesFileSignature(ext: string, bytes: Buffer): boolean {
  switch (ext.toLowerCase()) {
    case ".pdf":
      // Spesifikasi PDF mengizinkan header muncul di 1024 byte pertama
      return bytes.subarray(0, 1024).includes(PDF_SIG);
    case ".docx":
    case ".xlsx":
      return bytes.subarray(0, ZIP_SIG.length).equals(ZIP_SIG);
    case ".doc":
    case ".xls":
      return bytes.subarray(0, OLE_SIG.length).equals(OLE_SIG);
    default:
      return true;
  }
}

/** Simpan file dokumen project (PDF/Office/gambar). Image di-optimize. */
export async function saveProjectDocumentFile(
  file: File,
  prefix: string
): Promise<{
  url: string;
  filename: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const originalName = file.name || "dokumen";
  const ext = path.extname(originalName).toLowerCase() || guessExt(file.type);
  if (!DOCUMENT_ALLOWED_EXT.has(ext)) {
    throw new Error("Format: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, WebP");
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("Ukuran file maksimal 25MB");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!matchesFileSignature(ext, bytes)) {
    throw new Error("Isi file tidak sesuai format. Pastikan file asli PDF/Word/Excel.");
  }
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });

  let buffer: Buffer = bytes;
  let storedExt = ext;
  let mimeType = documentMimeForExt(ext) || file.type || "application/octet-stream";

  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
    const optimized = await optimizeEvidence(bytes);
    buffer = optimized.buffer;
    storedExt = optimized.ext;
    mimeType = "image/jpeg";
  }

  const storedName = `${prefix}-${Date.now()}${storedExt}`;
  await writeFile(path.join(uploadDir, storedName), buffer);

  return {
    url: `/api/uploads/${storedName}`,
    filename: originalName,
    storedName,
    mimeType,
    sizeBytes: buffer.length,
  };
}

function guessExt(mime: string): string {
  if (mime === "application/pdf") return ".pdf";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return "";
}

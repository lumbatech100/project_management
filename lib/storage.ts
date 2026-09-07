import { existsSync, statSync } from "fs";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { optimizeEvidence } from "@/lib/image";

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

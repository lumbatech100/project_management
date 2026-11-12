import sharp from "sharp";
import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** Max edge for floor drawings — huge scans (8k+) often blank on first paint. */
const MAX_EDGE = 2400;
/**
 * Versi zoom: dimuat setelah user zoom. 5000px ≈ 23 MP (≈90 MB decoded) —
 * masih aman untuk browser HP; lebih besar sering gagal decode di iOS.
 */
const HI_MAX_EDGE = 5000;
const EVIDENCE_MAX_EDGE = 1600;
/** Render PDF lebih besar dari HI_MAX_EDGE supaya garis tipis tetap tajam setelah resize. */
const PDF_RENDER_EDGE = 6000;

/** Render halaman pertama PDF ke PNG (butuh poppler-utils / pdftoppm). */
export async function pdfFirstPageToPng(input: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "drawing-"));
  try {
    const src = path.join(dir, "in.pdf");
    const outBase = path.join(dir, "out");
    await writeFile(src, input);
    await execFileAsync(
      "pdftoppm",
      [
        "-png",
        "-f",
        "1",
        "-l",
        "1",
        "-singlefile",
        "-scale-to",
        String(PDF_RENDER_EDGE),
        src,
        outBase,
      ],
      { timeout: 60_000 }
    );
    return await readFile(`${outBase}.png`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function optimizeDrawing(
  input: Buffer,
  preferredExt: ".jpg" | ".png"
): Promise<{ buffer: Buffer; ext: ".jpg" | ".png" }> {
  const image = sharp(input, { failOn: "none", limitInputPixels: false }).rotate();
  const meta = await image.metadata();
  const needsResize =
    (meta.width && meta.width > MAX_EDGE) ||
    (meta.height && meta.height > MAX_EDGE);

  let pipeline = image;
  if (needsResize) {
    pipeline = pipeline.resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Prefer JPEG for scans — much smaller, reliable browser decode
  if (
    preferredExt === ".jpg" ||
    needsResize ||
    (meta.size && meta.size > 3_000_000)
  ) {
    const buffer = await pipeline
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return { buffer, ext: ".jpg" };
  }

  const buffer = await pipeline.png({ compressionLevel: 8 }).toBuffer();
  return { buffer, ext: ".png" };
}

/**
 * Versi resolusi tinggi untuk zoom. Null kalau sumber tidak lebih besar dari
 * versi tampilan (tidak ada detail tambahan yang bisa didapat).
 */
export async function optimizeDrawingHi(input: Buffer): Promise<Buffer | null> {
  const image = sharp(input, { failOn: "none", limitInputPixels: false }).rotate();
  const meta = await image.metadata();
  const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (longEdge <= MAX_EDGE) return null;
  return image
    .flatten({ background: "#ffffff" })
    .resize({
      width: HI_MAX_EDGE,
      height: HI_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

/** Foto bukti progress / blocker — selalu JPEG kecil */
export async function optimizeEvidence(
  input: Buffer
): Promise<{ buffer: Buffer; ext: ".jpg" }> {
  const buffer = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: EVIDENCE_MAX_EDGE,
      height: EVIDENCE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
  return { buffer, ext: ".jpg" };
}

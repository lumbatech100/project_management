import sharp from "sharp";

/** Max edge for floor drawings — huge scans (8k+) often blank on first paint. */
const MAX_EDGE = 2400;
const EVIDENCE_MAX_EDGE = 1600;

export async function optimizeDrawing(
  input: Buffer,
  preferredExt: ".jpg" | ".png"
): Promise<{ buffer: Buffer; ext: ".jpg" | ".png" }> {
  const image = sharp(input, { failOn: "none" }).rotate();
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

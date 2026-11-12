/**
 * Helper browser-only: kecilkan gambar sebelum upload supaya koneksi lapangan
 * yang lambat tidak kena timeout proxy (Traefik memutus body > 60 detik).
 */

/** Cukup besar untuk versi zoom di server (5000px) + sedikit margin. */
const CLIENT_MAX_EDGE = 6000;
/** Batas canvas iOS Safari 16.7 MP — di atas itu hasil gambar kosong. */
const IOS_MAX_PIXELS = 16_000_000;

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** File kecil dikirim apa adanya — tidak perlu re-encode. */
const SKIP_BELOW_BYTES = 2 * 1024 * 1024;
const RASTER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function baseName(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Downscale JPG/PNG/WEBP ke JPEG max 6000px (iOS: max 16 MP). Background putih (PNG transparan
 * jadi putih, bukan hitam). Kalau browser gagal decode, file asli dikembalikan.
 */
export async function shrinkImageForUpload(file: File): Promise<File> {
  if (!RASTER_TYPES.has(file.type) || file.size <= SKIP_BELOW_BYTES) {
    return file;
  }
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    let scale = Math.min(
      1,
      CLIENT_MAX_EDGE / Math.max(bitmap.width, bitmap.height)
    );
    if (isIOS()) {
      scale = Math.min(
        scale,
        Math.sqrt(IOS_MAX_PIXELS / (bitmap.width * bitmap.height))
      );
    }
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    );
    canvas.width = 0;
    canvas.height = 0;
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${baseName(file.name)}.jpg`, {
      type: "image/jpeg",
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

export type UploadResult = { ok: boolean; status: number; data: unknown };

/** POST FormData dengan progress (fetch tidak punya upload progress). */
export function uploadWithProgress(
  url: string,
  form: FormData,
  onProgress?: (pct: number) => void,
  timeoutMs = 10 * 60 * 1000
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = timeoutMs;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      let data: unknown = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON (mis. halaman error proxy)
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () =>
      reject(new Error("Koneksi terputus saat upload. Cek internet lalu coba lagi."));
    xhr.ontimeout = () =>
      reject(new Error("Upload terlalu lama (timeout). Coba koneksi yang lebih stabil."));
    xhr.send(form);
  });
}

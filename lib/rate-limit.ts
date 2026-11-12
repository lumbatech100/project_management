/**
 * Rate limiter in-memory (fixed window) untuk endpoint sensitif:
 * login, aktivasi undangan, form publik isi data.
 * Berlaku per proses Node — kalau app di-scale ke banyak instance,
 * ganti store-nya ke Redis supaya limit dihitung bersama.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 50_000;

function sweep(now: number) {
  for (const [key, b] of Array.from(buckets.entries())) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { ok: boolean; retryAfterSec: number };

/** Catat 1 percobaan untuk `key`; ok=false kalau sudah melewati `limit` dalam window. */
export function hitRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) sweep(now);

  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}

type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined;

function readHeader(headers: HeaderSource, name: string): string {
  if (!headers) return "";
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) || "";
  }
  const v = (headers as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(v) ? v[0] || "" : v || "";
}

/** IP client dari header reverse proxy (x-forwarded-for / x-real-ip). */
export function clientIp(headers: HeaderSource): string {
  const xff = readHeader(headers, "x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || "unknown";
  return readHeader(headers, "x-real-ip").trim() || "unknown";
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_PER_EMAIL = 5;
const LOGIN_MAX_PER_IP = 30;

/**
 * Brute-force guard login: max 5 percobaan per email & 30 per IP / 15 menit.
 * Panggil `clearLoginAttempts` setelah login sukses.
 */
export function checkLoginAttempt(
  email: string,
  headers: HeaderSource
): RateLimitResult {
  const ip = clientIp(headers);
  const byIp = hitRateLimit(`login:ip:${ip}`, LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS);
  const byEmail = hitRateLimit(
    `login:email:${email.trim().toLowerCase()}`,
    LOGIN_MAX_PER_EMAIL,
    LOGIN_WINDOW_MS
  );
  if (!byIp.ok || !byEmail.ok) {
    return {
      ok: false,
      retryAfterSec: Math.max(byIp.retryAfterSec, byEmail.retryAfterSec),
    };
  }
  return { ok: true, retryAfterSec: 0 };
}

export function clearLoginAttempts(email: string) {
  resetRateLimit(`login:email:${email.trim().toLowerCase()}`);
}

/** Guard untuk endpoint publik berbasis token (undangan / isi data). */
export function checkPublicFormLimit(
  scope: string,
  headers: HeaderSource,
  limit = 20,
  windowMs = 10 * 60 * 1000
): RateLimitResult {
  return hitRateLimit(`${scope}:${clientIp(headers)}`, limit, windowMs);
}

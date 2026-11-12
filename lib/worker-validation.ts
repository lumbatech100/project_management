import { isBloodType } from "./blood-types";
import { formatDateKey, getJakartaTodayDate, parseDateKey } from "./workday";

export const WORKER_GENDERS = ["L", "P"] as const;

const MAX_LEN = {
  name: 120,
  email: 254,
  address: 500,
  notes: 2000,
} as const;

export class WorkerFieldError extends Error {}

/** undefined = field tidak dikirim (biarkan), null = dikosongkan */
type Opt<T> = T | null | undefined;

function text(v: unknown, label: string, max: number): Opt<string> {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw new WorkerFieldError(`${label} tidak valid`);
  const t = v.trim();
  if (!t) return null;
  if (t.length > max) {
    throw new WorkerFieldError(`${label} maksimal ${max} karakter`);
  }
  return t;
}

/** Nomor HP: angka dengan + di depan opsional; spasi/strip/titik/kurung dibuang. */
export function normalizePhone(v: unknown, label: string): Opt<string> {
  const t = text(v, label, 30);
  if (!t) return t;
  const compact = t.replace(/[\s\-().]/g, "");
  if (!/^\+?\d{8,15}$/.test(compact)) {
    throw new WorkerFieldError(`${label} harus berisi 8–15 digit angka`);
  }
  return compact;
}

export function normalizeNik(v: unknown): Opt<string> {
  const t = text(v, "NIK", 32);
  if (!t) return t;
  const compact = t.replace(/\s/g, "");
  if (!/^\d{16}$/.test(compact)) {
    throw new WorkerFieldError("NIK harus 16 digit angka");
  }
  return compact;
}

export function normalizeEmail(v: unknown): Opt<string> {
  const t = text(v, "Email", MAX_LEN.email);
  if (!t) return t;
  if (!/^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]{2,}$/.test(t)) {
    throw new WorkerFieldError("Format email tidak valid");
  }
  return t.toLowerCase();
}

export function normalizeBloodType(v: unknown): Opt<string> {
  const t = text(v, "Golongan darah", 20);
  if (!t) return t;
  if (!isBloodType(t)) throw new WorkerFieldError("Golongan darah tidak valid");
  return t;
}

export function normalizeGender(v: unknown): Opt<string> {
  const t = text(v, "Jenis kelamin", 5);
  if (!t) return t;
  if (!(WORKER_GENDERS as readonly string[]).includes(t)) {
    throw new WorkerFieldError("Jenis kelamin harus L atau P");
  }
  return t;
}

/** Tanggal YYYY-MM-DD (boleh ISO lengkap), tidak di masa depan, tidak sebelum 1900. */
export function normalizePastDate(v: unknown, label: string): Opt<Date> {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string") throw new WorkerFieldError(`${label} tidak valid`);
  const key = v.trim().slice(0, 10);
  const date = parseDateKey(key);
  if (!date || formatDateKey(date) !== key) {
    throw new WorkerFieldError(`${label} tidak valid`);
  }
  if (key < "1900-01-01" || date.getTime() > getJakartaTodayDate().getTime()) {
    throw new WorkerFieldError(`${label} di luar rentang yang diizinkan`);
  }
  return date;
}

export type WorkerProfileFields = {
  phone: Opt<string>;
  email: Opt<string>;
  nik: Opt<string>;
  address: Opt<string>;
  gender: Opt<string>;
  bloodType: Opt<string>;
  emergencyName: Opt<string>;
  emergencyPhone: Opt<string>;
  notes: Opt<string>;
  birthDate: Opt<Date>;
  joinedAt: Opt<Date>;
};

/** Validasi field biodata pekerja; lempar WorkerFieldError (→ HTTP 400). */
export function parseWorkerProfile(
  body: Record<string, unknown>
): WorkerProfileFields {
  return {
    phone: normalizePhone(body.phone, "Nomor HP"),
    email: normalizeEmail(body.email),
    nik: normalizeNik(body.nik),
    address: text(body.address, "Alamat", MAX_LEN.address),
    gender: normalizeGender(body.gender),
    bloodType: normalizeBloodType(body.bloodType),
    emergencyName: text(body.emergencyName, "Nama kontak darurat", MAX_LEN.name),
    emergencyPhone: normalizePhone(body.emergencyPhone, "Nomor HP kontak darurat"),
    notes: text(body.notes, "Catatan", MAX_LEN.notes),
    birthDate: normalizePastDate(body.birthDate, "Tanggal lahir"),
    joinedAt: normalizePastDate(body.joinedAt, "Tanggal bergabung"),
  };
}

export function workerNameOrThrow(v: unknown): string | null {
  const t = text(v, "Nama", MAX_LEN.name);
  return t ?? null;
}

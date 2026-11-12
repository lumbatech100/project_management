/** Opsi golongan darah untuk form pekerja */
export const BLOOD_TYPES = [
  "A",
  "B",
  "AB",
  "O",
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
  "Tidak tahu",
] as const;

export type BloodType = (typeof BLOOD_TYPES)[number];

export function isBloodType(v: string): v is BloodType {
  return (BLOOD_TYPES as readonly string[]).includes(v);
}

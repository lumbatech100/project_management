/** Profil pintu / lift + checklist pekerjaan dengan bobot dinamis (bagi rata). */

export const DOOR_PROFILES = [
  { code: "1D_CR_CR", label: "1D CR CR", description: "Single door, double card reader" },
  { code: "2D_CR_CR", label: "2D CR CR", description: "Double door, double card reader" },
  { code: "1D_FP_CR", label: "1D FP CR", description: "Single door, fingerprint + card reader" },
  { code: "2D_FP_CR", label: "2D FP CR", description: "Double door, fingerprint + card reader" },
  { code: "2D_FP_FP", label: "2D FP FP", description: "Double door, double fingerprint" },
  { code: "2D_FR_FR", label: "2D FR FR", description: "Double door, double face recognition" },
  { code: "EMERGENCY", label: "EMERGENCY", description: "Pintu emergency" },
  { code: "TURNSTILE", label: "TURNSTILE", description: "Turnstile" },
  { code: "LIFT", label: "LIFT", description: "Lift / elevator" },
] as const;

export type DoorProfileCode = (typeof DOOR_PROFILES)[number]["code"];

export const KEYSWITCH_ITEM = "Keyswitch";

const DOOR_CHECKLIST = [
  "Bobok",
  "Sparing pipa",
  "Tarikan kabel",
  "Mounting panel",
  "Mounting reader in",
  "Mounting reader out",
  "Mounting emlock",
  "Mounting DC",
  "Breakglass",
  "Buzzer",
  KEYSWITCH_ITEM,
  "Terminasi accessories",
  "Terminasi panel",
  "Program to P1",
  "Labelling",
  "Perapihan sipil",
  "Perapihan panel",
] as const;

const LIFT_CHECKLIST = [
  "Tarikan kabel",
  "Pasang point to point",
  "Mounting controller",
  "Mounting sub controller",
  "Mounting converter",
  "Mounting reader",
  "Terminasi panel",
  "Terminasi accessories",
  "Program to P1",
  "Labelling",
  "Perapihan panel",
] as const;

/** Urutan kolom rekap matrix (door dulu, lalu item lift yang belum ada). */
export const REKAP_CHECKLIST_COLUMNS: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of [...DOOR_CHECKLIST, ...LIFT_CHECKLIST]) {
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
})();

/** Header pendek untuk kolom matrix (Excel-style). */
export function checklistColumnShort(name: string): string {
  const map: Record<string, string> = {
    Bobok: "Bobok",
    "Sparing pipa": "Pipa",
    "Tarikan kabel": "Kabel",
    "Mounting panel": "Panel",
    "Mounting reader in": "Rdr in",
    "Mounting reader out": "Rdr out",
    "Mounting emlock": "Emlock",
    "Mounting DC": "DC",
    Breakglass: "BG",
    Buzzer: "Buzzer",
    Keyswitch: "KS",
    "Terminasi accessories": "Term. Acc",
    "Terminasi panel": "Term. Panel",
    "Program to P1": "Prog P1",
    Labelling: "Label",
    "Perapihan sipil": "Sipil",
    "Perapihan panel": "Rap. Panel",
    "Pasang point to point": "P2P",
    "Mounting controller": "Ctrl",
    "Mounting sub controller": "Sub ctrl",
    "Mounting converter": "Conv",
    "Mounting reader": "Reader",
  };
  return map[name] || name;
}

export function isDoorProfileCode(v: unknown): v is DoorProfileCode {
  return (
    typeof v === "string" &&
    DOOR_PROFILES.some((p) => p.code === v)
  );
}

export function profileAllowsKeyswitch(code: DoorProfileCode): boolean {
  return code !== "LIFT";
}

export function profileLabel(code: string | null | undefined): string {
  if (!code) return "—";
  const found = DOOR_PROFILES.find((p) => p.code === code);
  return found?.label ?? code;
}

const EMERGENCY_EXCLUDE = new Set([
  "Mounting reader in",
  "Mounting reader out",
]);

/** Nama checklist aktif untuk profil (+ keyswitch bila relevan). */
export function checklistNamesForProfile(
  profileCode: DoorProfileCode,
  hasKeyswitch: boolean
): string[] {
  if (profileCode === "LIFT") {
    return [...LIFT_CHECKLIST];
  }
  return DOOR_CHECKLIST.filter((name) => {
    if (name === KEYSWITCH_ITEM && !hasKeyswitch) return false;
    if (profileCode === "EMERGENCY" && EMERGENCY_EXCLUDE.has(name)) return false;
    return true;
  });
}

/** Bobot sama rata; total ≈ 100 (item terakhir menyesuaikan sisa). */
export function equalBobot(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [100];
  const each = Math.floor((10000 / count)) / 100; // 2 desimal
  const weights = Array.from({ length: count }, () => each);
  const sum = weights.reduce((a, b) => a + b, 0);
  weights[count - 1] = Math.round((100 - (sum - each)) * 100) / 100;
  return weights;
}

export function buildChecklistItems(
  profileCode: DoorProfileCode,
  hasKeyswitch: boolean
): { name: string; bobot: number }[] {
  const names = checklistNamesForProfile(profileCode, hasKeyswitch);
  const weights = equalBobot(names.length);
  return names.map((name, i) => ({ name, bobot: weights[i]! }));
}

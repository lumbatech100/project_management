/** Jabatan pekerja sesuai sistem (dropdown tetap). */
export const WORKER_POSITIONS = [
  "PM",
  "SM",
  "Leader",
  "Worker",
  "HSE",
] as const;

/** Undangan grup / subcon: tanpa PM & SM */
export const INVITE_POSITIONS = ["Leader", "Worker", "HSE"] as const;

export type WorkerPosition = (typeof WORKER_POSITIONS)[number];
export type InvitePosition = (typeof INVITE_POSITIONS)[number];

export function isWorkerPosition(v: string): v is WorkerPosition {
  return (WORKER_POSITIONS as readonly string[]).includes(v);
}

export function isInvitePosition(v: string): v is InvitePosition {
  return (INVITE_POSITIONS as readonly string[]).includes(v);
}

export const DEFAULT_WORKER_POSITION: WorkerPosition = "Worker";

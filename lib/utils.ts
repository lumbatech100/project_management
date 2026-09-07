import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Role } from "@prisma/client";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function canCreateProject(role: Role) {
  return role === "ADMIN" || role === "PM";
}

export function canManageDrawing(role: Role) {
  return role === "ADMIN" || role === "PM";
}

/** @deprecated gunakan canSubmitProgress / canApproveProgress */
export function canCheckProgress(role: Role) {
  return role === "SM" || role === "LEADER";
}

/** Leader: centang lalu submit untuk approval SM */
export function canSubmitProgress(role: Role) {
  return role === "LEADER";
}

/** SM (dan Admin): approve / tolak submission Leader */
export function canApproveProgress(role: Role) {
  return role === "SM" || role === "ADMIN";
}

export function canManageUsers(role: Role) {
  return role === "ADMIN";
}

export function canManageCost(role: Role) {
  return role === "ADMIN" || role === "PM";
}

export function canManageWorkers(role: Role) {
  return role === "ADMIN" || role === "PM";
}

/** Admin/PM/SM: lihat laporan harian */
export function canViewDailyReport(role: Role) {
  return role === "ADMIN" || role === "PM" || role === "SM";
}

/** Admin/PM: tutup manual / kelola report */
export function canManageDailyReport(role: Role) {
  return role === "ADMIN" || role === "PM";
}

/** Leader hanya Progress di dalam project */
export function isLeaderOnlyProgress(role: Role) {
  return role === "LEADER";
}

type ProgressItem = { bobot: number; done: boolean };
type ProgressMarker = { items: ProgressItem[] };
type ProgressFloor = { markers: ProgressMarker[] };

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** Progress 1 marker/pintu dari bobot breakdown (dinormalisasi) */
export function calcMarkerProgress(items: ProgressItem[]): number {
  if (items.length === 0) return 0;
  const total = items.reduce((sum, i) => sum + i.bobot, 0);
  if (total === 0) return 0;
  const done = items
    .filter((i) => i.done)
    .reduce((sum, i) => sum + i.bobot, 0);
  return round1((done / total) * 100);
}

/** @deprecated pakai calcMarkerProgress */
export function calcProgress(items: ProgressItem[]): number {
  return calcMarkerProgress(items);
}

/**
 * Progress 1 lantai = rata-rata progress semua marker/pintu (bobot sama).
 * Marker tanpa item dihitung 0%.
 * Lantai tanpa marker = 0%.
 */
export function calcFloorProgress(markers: ProgressMarker[]): number {
  if (markers.length === 0) return 0;
  const sum = markers.reduce((s, m) => s + calcMarkerProgress(m.items), 0);
  return round1(sum / markers.length);
}

/**
 * Progress project = rata-rata progress semua lantai (bobot sama).
 * 6 lantai → tiap lantai menyumbang ~16.7% ke keseluruhan.
 * Lantai tanpa marker = 0%.
 */
export function calcProjectProgress(floors: ProgressFloor[]): number {
  if (floors.length === 0) return 0;
  const sum = floors.reduce((s, f) => s + calcFloorProgress(f.markers), 0);
  return round1(sum / floors.length);
}

export function formatRp(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

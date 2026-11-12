import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Role } from "@prisma/client";
import { hasMenu, type MenuKey } from "./menus";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Menus = string[] | null | undefined;

function has(menus: Menus, key: MenuKey) {
  return hasMenu(menus, key);
}

export function canCreateProject(role: Role, menus?: Menus) {
  if (isViewOnlyRole(role)) return false;
  if (role === "ADMIN" || role === "PM") return true;
  // Hanya jika Admin memberi akses Project Details (bukan sekadar list Project)
  return has(menus, "project.details");
}

export function canManageDrawing(role: Role, menus?: Menus) {
  if (isViewOnlyRole(role)) return false;
  if (role === "ADMIN" || role === "PM") return true;
  // Timeline / Details = kelola denah & marker; Progress saja = input centang
  return has(menus, "project.timeline") || has(menus, "project.details");
}

/** @deprecated gunakan canSubmitProgress / canApproveProgress */
export function canCheckProgress(role: Role) {
  return role === "SM" || role === "LEADER";
}

/** Leader: centang lalu submit untuk approval SM */
export function canSubmitProgress(role: Role, menus?: Menus) {
  void menus;
  return role === "LEADER";
}

/** SM/Admin, atau user yang diberi menu Pending approval */
export function canApproveProgress(role: Role, menus?: Menus) {
  if (isViewOnlyRole(role)) return false;
  if (role === "SM" || role === "ADMIN") return true;
  return has(menus, "project.approval");
}

/** Admin, atau user yang diberi menu User Management */
export function canManageUsers(role: Role, menus?: Menus) {
  if (isViewOnlyRole(role)) return false;
  if (role === "ADMIN") return true;
  return has(menus, "main.user");
}

export function canManageCost(role: Role, menus?: Menus) {
  if (isViewOnlyRole(role)) return false;
  if (role === "ADMIN" || role === "PM") return true;
  return has(menus, "project.cost");
}

/** Admin/PM/SM, atau menu Cost */
export function canRecordExpense(role: Role, menus?: Menus) {
  if (isViewOnlyRole(role)) return false;
  if (role === "ADMIN" || role === "PM" || role === "SM") return true;
  return has(menus, "project.cost");
}

export function canManageWorkers(role: Role, menus?: Menus) {
  if (isViewOnlyRole(role)) return false;
  if (role === "ADMIN" || role === "PM") return true;
  return has(menus, "project.pekerja");
}

export function canManageDocuments(role: Role, menus?: Menus) {
  if (isViewOnlyRole(role)) return false;
  if (role === "ADMIN" || role === "PM") return true;
  return has(menus, "project.dokumen");
}

export function canManageInventory(role: Role, menus?: Menus) {
  if (isViewOnlyRole(role)) return false;
  if (role === "ADMIN" || role === "PM") return true;
  return has(menus, "project.inventory");
}

export function canManagePo(role: Role, menus?: Menus) {
  if (isViewOnlyRole(role)) return false;
  if (role === "ADMIN" || role === "PM") return true;
  return has(menus, "project.po");
}

export function canUpdatePoProgress(role: Role, menus?: Menus) {
  if (isViewOnlyRole(role)) return false;
  if (role === "ADMIN" || role === "PM" || role === "SM") return true;
  return has(menus, "project.po");
}

export function canRecordDelivery(role: Role, menus?: Menus) {
  if (isViewOnlyRole(role)) return false;
  if (role === "ADMIN" || role === "PM" || role === "SM") return true;
  return has(menus, "project.inventory");
}

export function canViewDailyReport(role: Role, menus?: Menus) {
  if (role === "ADMIN" || role === "PM" || role === "SM") return true;
  return has(menus, "project.laporan");
}

export function canManageDailyReport(role: Role, menus?: Menus) {
  if (isViewOnlyRole(role)) return false;
  if (role === "ADMIN" || role === "PM") return true;
  return has(menus, "project.laporan");
}

/** Client: view-only — tidak ada aksi write di project */
export function isViewOnlyRole(role: Role) {
  return role === "CLIENT";
}

/** Leader hanya Progress di dalam project */
export function isLeaderOnlyProgress(role: Role) {
  return role === "LEADER";
}

type ProgressItem = {
  bobot: number;
  done?: boolean;
  /** 0–100; jika ada, dipakai sebagai bobot efektif (bukan binary done) */
  progressPct?: number | null;
};
type ProgressMarker = { items: ProgressItem[] };
type ProgressFloor = { markers: ProgressMarker[] };

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** Bobot efektif item = bobot × progressPct/100 (fallback: done → 100%). */
export function itemEffectiveBobot(item: ProgressItem): number {
  const pct =
    typeof item.progressPct === "number"
      ? Math.min(100, Math.max(0, item.progressPct))
      : item.done
        ? 100
        : 0;
  return item.bobot * (pct / 100);
}

/** Progress 1 marker/pintu dari bobot × % progress (dinormalisasi) */
export function calcMarkerProgress(items: ProgressItem[]): number {
  if (items.length === 0) return 0;
  const total = items.reduce((sum, i) => sum + i.bobot, 0);
  if (total === 0) return 0;
  const done = items.reduce((sum, i) => sum + itemEffectiveBobot(i), 0);
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

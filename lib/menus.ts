import type { Role } from "@prisma/client";

/** Semua menu yang bisa di-assign Admin ke user */
export const MENU_CATALOG = [
  // Main app
  { key: "main.dashboard", group: "Main Menu", label: "Dashboard" },
  { key: "main.project", group: "Main Menu", label: "Project" },
  { key: "main.user", group: "Main Menu", label: "User Management" },
  { key: "main.setting", group: "Main Menu", label: "Setting" },
  // Project workspace
  { key: "project.overview", group: "Project", label: "Dashboard" },
  { key: "project.timeline", group: "Project", label: "Timeline" },
  { key: "project.progress", group: "Project", label: "Progress" },
  { key: "project.laporan", group: "Project", label: "Laporan Harian" },
  { key: "project.cost", group: "Project", label: "Cost" },
  { key: "project.inventory", group: "Project", label: "Inventory" },
  { key: "project.absen", group: "Project", label: "Absen" },
  { key: "project.pekerja", group: "Project", label: "Data Pekerja" },
  { key: "project.details", group: "Project", label: "Project Details" },
] as const;

export type MenuKey = (typeof MENU_CATALOG)[number]["key"];

export const ALL_MENU_KEYS: MenuKey[] = MENU_CATALOG.map((m) => m.key);

const MAIN_HREF_TO_MENU: Record<string, MenuKey> = {
  "/dashboard": "main.dashboard",
  "/project": "main.project",
  "/user": "main.user",
  "/setting": "main.setting",
};

const PROJECT_HREF_TO_MENU: Record<string, MenuKey> = {
  overview: "project.overview",
  timeline: "project.timeline",
  progress: "project.progress",
  laporan: "project.laporan",
  cost: "project.cost",
  inventory: "project.inventory",
  absen: "project.absen",
  pekerja: "project.pekerja",
  details: "project.details",
};

/** Default privilege per role (bisa diubah Admin per user) */
export function defaultMenusForRole(role: Role): MenuKey[] {
  switch (role) {
    case "ADMIN":
      return [...ALL_MENU_KEYS];
    case "PM":
      return ALL_MENU_KEYS.filter((k) => k !== "main.user");
    case "SM":
      return [
        "main.dashboard",
        "main.project",
        "main.setting",
        "project.overview",
        "project.progress",
        "project.laporan",
        "project.absen",
      ];
    case "LEADER":
      return ["main.project", "main.setting", "project.progress"];
    default:
      return ["main.project", "project.progress"];
  }
}

export function normalizeMenus(
  menus: unknown,
  role?: Role
): MenuKey[] {
  const allowed = new Set<string>(ALL_MENU_KEYS);
  let list: string[] = [];
  if (Array.isArray(menus)) {
    list = menus.filter((m): m is string => typeof m === "string");
  }
  const filtered = list.filter((m): m is MenuKey => allowed.has(m));
  if (filtered.length === 0 && role) {
    return defaultMenusForRole(role);
  }
  return filtered;
}

export function hasMenu(
  menus: string[] | undefined | null,
  key: MenuKey
): boolean {
  return !!menus?.includes(key);
}

export function mainMenuKeyFromHref(href: string): MenuKey | null {
  return MAIN_HREF_TO_MENU[href] ?? null;
}

export function projectMenuKeyFromHref(href: string): MenuKey | null {
  return PROJECT_HREF_TO_MENU[href] ?? null;
}

export function menusGrouped() {
  const groups: Record<string, { key: MenuKey; label: string }[]> = {};
  for (const m of MENU_CATALOG) {
    if (!groups[m.group]) groups[m.group] = [];
    groups[m.group].push({ key: m.key, label: m.label });
  }
  return groups;
}

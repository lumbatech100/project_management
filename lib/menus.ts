import type { Role } from "@prisma/client";

/** Semua menu yang bisa di-assign Admin ke user */
export const MENU_CATALOG = [
  // Main app
  { key: "main.dashboard", group: "Main Menu", label: "Dashboard" },
  { key: "main.project", group: "Main Menu", label: "Project" },
  { key: "main.user", group: "Main Menu", label: "User Management" },
  { key: "main.setting", group: "Main Menu", label: "Setting" },
  // Project workspace — group mengikuti sidebar
  { key: "project.overview", group: "Dashboard", label: "Dashboard" },
  { key: "project.timeline", group: "Timeline", label: "Timeline" },
  {
    key: "project.progress",
    group: "Progress Lapangan",
    label: "Input pekerjaan",
  },
  {
    key: "project.approval",
    group: "Progress Lapangan",
    label: "Pending approval",
  },
  {
    key: "project.checklist",
    group: "Progress Lapangan",
    label: "Rekap progress",
  },
  {
    key: "project.laporan",
    group: "Progress Lapangan",
    label: "Laporan harian",
  },
  {
    key: "project.blocker",
    group: "Progress Lapangan",
    label: "Blocker",
  },
  { key: "project.inventory", group: "Inventory", label: "Inventory" },
  {
    key: "project.po",
    group: "Progress Kumulatif",
    label: "Progress Kumulatif",
  },
  { key: "project.dokumen", group: "Administrasi", label: "Dokumen" },
  { key: "project.cost", group: "Administrasi", label: "Cost" },
  { key: "project.absen", group: "Administrasi", label: "Absen" },
  { key: "project.pekerja", group: "Administrasi", label: "Data Pekerja" },
  { key: "project.details", group: "Project Details", label: "Project Details" },
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
  approval: "project.approval",
  checklist: "project.checklist",
  laporan: "project.laporan",
  blocker: "project.blocker",
  po: "project.po",
  dokumen: "project.dokumen",
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
      // Pending Approval hanya untuk yang berhak approve (SM/Admin)
      return ALL_MENU_KEYS.filter(
        (k) => k !== "main.user" && k !== "project.approval"
      );
    case "SM":
      return [
        "main.dashboard",
        "main.project",
        "main.setting",
        "project.overview",
        "project.progress",
        "project.approval",
        "project.checklist",
        "project.laporan",
        "project.blocker",
        "project.po",
        "project.cost",
        "project.dokumen",
        "project.inventory",
        "project.absen",
      ];
    case "LEADER":
      return [
        "main.project",
        "main.setting",
        "project.progress",
        "project.checklist",
        "project.blocker",
      ];
    case "CLIENT":
      return [
        "main.dashboard",
        "main.project",
        "project.overview",
        "project.timeline",
        "project.progress",
        "project.approval",
        "project.checklist",
        "project.laporan",
        "project.blocker",
        "project.po",
      ];
    default:
      return ["main.project", "project.progress", "project.checklist"];
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

export type MenuGroup = {
  group: string;
  items: { key: MenuKey; label: string }[];
};

export function menusGrouped(): MenuGroup[] {
  const groups: MenuGroup[] = [];
  const index = new Map<string, number>();
  for (const m of MENU_CATALOG) {
    let i = index.get(m.group);
    if (i === undefined) {
      i = groups.length;
      index.set(m.group, i);
      groups.push({ group: m.group, items: [] });
    }
    groups[i]!.items.push({ key: m.key, label: m.label });
  }
  return groups;
}

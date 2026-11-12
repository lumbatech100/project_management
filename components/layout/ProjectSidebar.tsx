"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  AlertTriangle,
  FileBarChart2,
  FolderOpen,
  GanttChart,
  HardHat,
  Inbox,
  Boxes,
  Info,
  LayoutDashboard,
  PackageMinus,
  PackagePlus,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
import { hasMenu, type MenuKey } from "@/lib/menus";
import { useMobileNav } from "./MobileNavProvider";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Activity;
  menu: MenuKey;
  soon?: boolean;
  /** Aktif hanya di path persis, bukan sub-halaman */
  exact?: boolean;
  /** Path lain (relatif project) yang ikut menandai menu ini aktif */
  alsoActive?: string[];
  /** Keterangan angka badge, mis. "belum dibaca" */
  badgeLabel?: string;
};

const projectNav: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      {
        href: "overview",
        label: "Dashboard",
        icon: LayoutDashboard,
        menu: "project.overview",
      },
      {
        href: "timeline",
        label: "Timeline",
        icon: GanttChart,
        menu: "project.timeline",
      },
    ],
  },
  {
    title: "Progress Lapangan",
    items: [
      {
        href: "progress",
        label: "Input pekerjaan",
        icon: Activity,
        menu: "project.progress",
      },
      {
        href: "approval",
        label: "Pending approval",
        icon: Inbox,
        menu: "project.approval",
      },
      {
        href: "checklist",
        label: "Rekap progress",
        icon: ClipboardCheck,
        menu: "project.checklist",
      },
      {
        href: "laporan",
        label: "Laporan harian",
        icon: ClipboardList,
        menu: "project.laporan",
      },
      {
        href: "blocker",
        label: "Blocker",
        icon: AlertTriangle,
        menu: "project.blocker",
        badgeLabel: "belum dibaca",
      },
    ],
  },
  {
    title: "Inventory",
    items: [
      {
        href: "inventory/masuk",
        label: "Barang masuk",
        icon: PackagePlus,
        menu: "project.inventory",
      },
      {
        href: "inventory/keluar",
        label: "Barang keluar",
        icon: PackageMinus,
        menu: "project.inventory",
      },
      {
        href: "inventory/stok",
        label: "Rekap stok",
        icon: Boxes,
        menu: "project.inventory",
        alsoActive: ["inventory/ceklist"],
        badgeLabel: "stok menipis",
      },
    ],
  },
  {
    items: [
      {
        href: "po",
        label: "Progress Kumulatif",
        icon: FileBarChart2,
        menu: "project.po",
      },
    ],
  },
  {
    title: "Administrasi",
    items: [
      {
        href: "dokumen",
        label: "Dokumen",
        icon: FolderOpen,
        menu: "project.dokumen",
      },
      { href: "cost", label: "Cost", icon: Wallet, menu: "project.cost" },
      {
        href: "absen",
        label: "Absen",
        icon: CalendarCheck,
        menu: "project.absen",
      },
      {
        href: "pekerja",
        label: "Data Pekerja",
        icon: HardHat,
        menu: "project.pekerja",
      },
    ],
  },
  {
    items: [
      {
        href: "details",
        label: "Project Details",
        icon: Info,
        menu: "project.details",
      },
    ],
  },
];

interface ProjectSidebarProps {
  projectId: string;
  projectName: string;
  progress: number;
  menus?: string[];
  /** Angka notifikasi per href menu (mis. jumlah stok menipis) */
  badges?: Record<string, number>;
}

export function ProjectSidebar({
  projectId,
  projectName,
  progress,
  menus = [],
  badges = {},
}: ProjectSidebarProps) {
  const pathname = usePathname();
  const { open, closeNav } = useMobileNav();
  const base = `/project/${projectId}`;
  const nav = projectNav
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => hasMenu(menus, item.menu)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Tutup menu"
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px] print:hidden lg:hidden"
          onClick={closeNav}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col border-r border-white/10 bg-[linear-gradient(180deg,#12243A_0%,#0E1A2C_50%,#080F1A_100%)] text-white transition-transform duration-200 print:hidden lg:static lg:z-auto lg:h-screen lg:w-60 lg:shrink-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="border-b border-white/10 px-4 py-4">
          <div className="mb-3">
            <Logo variant="light" className="h-7" />
          </div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-white/60">
              <Building2 className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">
                Project
              </span>
            </div>
            <button
              type="button"
              onClick={closeNav}
              className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 lg:hidden"
              aria-label="Tutup"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p
            className="truncate text-base font-bold text-white"
            title={projectName}
          >
            {projectName}
          </p>
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-xs text-white/70">
              <span>Progress</span>
              <span className="font-medium text-white">{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          {nav.map((section, sectionIndex) => (
            <div key={section.title ?? `section-${sectionIndex}`}>
              {section.title && (
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                  {section.title}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const href = `${base}/${item.href}`;
                  const active =
                    pathname === href ||
                    (!item.exact && pathname.startsWith(href + "/")) ||
                    !!item.alsoActive?.some((p) =>
                      pathname.startsWith(`${base}/${p}`)
                    );
                  const badge = badges[item.href] ?? 0;
                  return (
                    <Link
                      key={item.href}
                      href={href}
                      onClick={closeNav}
                      className={cn(
                        "flex items-center gap-3 rounded-lg py-2.5 pr-3 text-sm font-medium transition-colors",
                        section.title ? "pl-5" : "pl-3",
                        active
                          ? "bg-white text-[#173049]"
                          : "text-white/75 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {badge > 0 && (
                        <span
                          className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
                          title={
                            item.badgeLabel
                              ? `${badge} ${item.badgeLabel}`
                              : String(badge)
                          }
                        >
                          {badge}
                        </span>
                      )}
                      {item.soon && (
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium",
                            active
                              ? "bg-[#003588]/10 text-[#003588]"
                              : "bg-white/10 text-white/70"
                          )}
                        >
                          soon
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3">
          <Link
            href={
              hasMenu(menus, "main.dashboard") ? "/dashboard" : "/project"
            }
            onClick={closeNav}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Main Menu
          </Link>
        </div>
      </aside>
    </>
  );
}

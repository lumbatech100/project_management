"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Info,
  GanttChart,
  Activity,
  Wallet,
  Package,
  CalendarCheck,
  ClipboardList,
  HardHat,
  ArrowLeft,
  Building2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hasMenu, type MenuKey } from "@/lib/menus";
import { useMobileNav } from "./MobileNavProvider";

const projectNav: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  menu: MenuKey;
  soon?: boolean;
}[] = [
  { href: "overview", label: "Dashboard", icon: LayoutDashboard, menu: "project.overview" },
  { href: "timeline", label: "Timeline", icon: GanttChart, menu: "project.timeline" },
  { href: "progress", label: "Progress", icon: Activity, menu: "project.progress" },
  { href: "laporan", label: "Laporan Harian", icon: ClipboardList, menu: "project.laporan" },
  { href: "cost", label: "Cost", icon: Wallet, menu: "project.cost" },
  { href: "inventory", label: "Inventory", icon: Package, menu: "project.inventory", soon: true },
  { href: "absen", label: "Absen", icon: CalendarCheck, menu: "project.absen", soon: true },
  { href: "pekerja", label: "Data Pekerja", icon: HardHat, menu: "project.pekerja" },
  { href: "details", label: "Project Details", icon: Info, menu: "project.details" },
];

interface ProjectSidebarProps {
  projectId: string;
  projectName: string;
  progress: number;
  menus?: string[];
}

export function ProjectSidebar({
  projectId,
  projectName,
  progress,
  menus = [],
}: ProjectSidebarProps) {
  const pathname = usePathname();
  const { open, closeNav } = useMobileNav();
  const base = `/project/${projectId}`;
  const nav = projectNav.filter((item) => hasMenu(menus, item.menu));

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Tutup menu"
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px] lg:hidden"
          onClick={closeNav}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(18rem,85vw)] flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:static lg:z-auto lg:h-screen lg:w-60 lg:shrink-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-400">
              <Building2 className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">
                Project
              </span>
            </div>
            <button
              type="button"
              onClick={closeNav}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Tutup"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p
            className="truncate text-base font-bold text-slate-900"
            title={projectName}
          >
            {projectName}
          </p>
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Progress</span>
              <span className="font-medium text-slate-700">{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-900"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {nav.map((item) => {
            const href = `${base}/${item.href}`;
            const active =
              pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={item.href}
                href={href}
                onClick={closeNav}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.soon && (
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium",
                      active
                        ? "bg-white/15 text-slate-200"
                        : "bg-slate-100 text-slate-400"
                    )}
                  >
                    soon
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-200 p-3">
          <Link
            href={
              hasMenu(menus, "main.dashboard") ? "/dashboard" : "/project"
            }
            onClick={closeNav}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Main Menu
          </Link>
        </div>
      </aside>
    </>
  );
}

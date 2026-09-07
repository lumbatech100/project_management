"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Settings,
  Building2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileNav } from "./MobileNavProvider";
import { hasMenu, type MenuKey } from "@/lib/menus";

const navItems: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  menu: MenuKey;
}[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, menu: "main.dashboard" },
  { href: "/project", label: "Project", icon: FolderKanban, menu: "main.project" },
  { href: "/user", label: "User", icon: Users, menu: "main.user" },
  { href: "/setting", label: "Setting", icon: Settings, menu: "main.setting" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { open, closeNav } = useMobileNav();
  const { data: session } = useSession();
  const menus = session?.user?.menus || [];
  const items = navItems.filter((item) => hasMenu(menus, item.menu));

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
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-7 w-7 text-slate-900" />
            <span className="text-xl font-bold tracking-tight text-slate-900">
              Simplo PMS
            </span>
          </div>
          <button
            type="button"
            onClick={closeNav}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const active =
              item.href === "/project"
                ? pathname === "/project"
                : pathname === item.href ||
                  pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeNav}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

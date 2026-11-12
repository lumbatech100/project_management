"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
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

export function Sidebar({ menus: menusProp }: { menus?: string[] }) {
  const pathname = usePathname();
  const { open, closeNav } = useMobileNav();
  const { data: session } = useSession();
  const menus = menusProp?.length ? menusProp : session?.user?.menus || [];
  const items = navItems.filter((item) => hasMenu(menus, item.menu));

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
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2">
            <Logo priority variant="light" className="h-7" />
            <span className="text-sm font-semibold tracking-wide text-white/70">
              PMS
            </span>
          </div>
          <button
            type="button"
            onClick={closeNav}
            className="rounded-lg p-2 text-white/70 hover:bg-white/10 lg:hidden"
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
                    ? "bg-white text-[#173049]"
                    : "text-white/75 hover:bg-white/10 hover:text-white"
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

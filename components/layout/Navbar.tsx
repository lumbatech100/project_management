"use client";

import { signOut, useSession } from "next-auth/react";
import { LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { useMobileNav } from "./MobileNavProvider";

export function Navbar() {
  const { data: session } = useSession();
  const { openNav } = useMobileNav();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-3 backdrop-blur print:hidden sm:px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={openNav}
          className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
          aria-label="Buka menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Logo className="h-5 lg:hidden" />
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {session?.user && (
          <div className="hidden text-right sm:block">
            <p className="max-w-[9rem] truncate text-sm font-medium text-slate-900 sm:max-w-none">
              {session.user.name}
            </p>
            <p className="text-xs text-slate-500">
              {session.user.role === "CLIENT" ? "Client" : session.user.role}
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={async () => {
            await signOut({ redirect: false });
            window.location.assign("/login");
          }}
        >
          <LogOut className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
}

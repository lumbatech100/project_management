"use client";

import { MobileNavProvider } from "./MobileNavProvider";

export function AppShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <MobileNavProvider>
      <div className="flex h-[100dvh] overflow-hidden">
        {sidebar}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </MobileNavProvider>
  );
}

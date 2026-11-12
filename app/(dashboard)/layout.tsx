import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Navbar } from "@/components/layout/Navbar";
import { AppShell } from "@/components/layout/AppShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell sidebar={<Sidebar menus={session.user.menus || []} />}>
      <Navbar />
      <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
        {children}
      </main>
    </AppShell>
  );
}

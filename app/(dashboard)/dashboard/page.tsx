import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcProjectProgress } from "@/lib/utils";
import { ChartOverview } from "@/components/dashboard/ChartOverview";

export default async function DashboardPage() {
  await getSession();

  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      floors: {
        include: {
          markers: {
            include: { items: true },
          },
        },
      },
    },
  });

  const chartData = projects.map((p) => ({
    name: p.name.length > 14 ? p.name.slice(0, 14) + "…" : p.name,
    progress: calcProjectProgress(p.floors),
  }));

  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const avgProgress =
    chartData.length === 0
      ? 0
      : Math.round(
          (chartData.reduce((s, d) => s + d.progress, 0) / chartData.length) * 10
        ) / 10;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Dashboard</h1>
        <p className="text-sm text-slate-500">Overview progress semua project</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
        <StatCard label="Total Project" value={String(totalProjects)} />
        <StatCard label="Aktif" value={String(activeProjects)} />
        <StatCard label="Avg Progress" value={`${avgProgress}%`} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Progress per Project
        </h2>
        <ChartOverview data={chartData} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-5">
      <p className="text-xs text-slate-500 sm:text-sm">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{value}</p>
    </div>
  );
}

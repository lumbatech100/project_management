import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProjectsProgress } from "@/lib/project-progress";
import { hasMenu } from "@/lib/menus";
import { projectListWhere } from "@/lib/project-access";
import { ChartOverview } from "@/components/dashboard/ChartOverview";

function firstName(name?: string | null) {
  const n = name?.trim();
  if (!n) return "di sana";
  return n.split(/\s+/)[0] || n;
}

function statusLabel(status: string) {
  if (status === "active") return "Berjalan";
  if (status === "completed") return "Selesai";
  return status;
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (!hasMenu(session.user.menus, "main.dashboard")) {
    redirect("/project");
  }

  const user = session.user;
  const isClient = user.role === "CLIENT";

  const projects = await prisma.project.findMany({
    where: projectListWhere(user.id, user.role),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      _count: { select: { floors: true } },
    },
  });
  const progressMap = await getProjectsProgress(projects.map((p) => p.id));

  const rows = projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    progress: progressMap.get(p.id) ?? 0,
    floorCount: p._count.floors,
  }));

  const chartData = rows.map((p) => ({
    name: p.name.length > 18 ? p.name.slice(0, 18) + "…" : p.name,
    progress: p.progress,
  }));

  const activeCount = rows.filter((p) => p.status === "active").length;
  const avgProgress =
    rows.length === 0
      ? 0
      : Math.round(
          (rows.reduce((s, d) => s + d.progress, 0) / rows.length) * 10
        ) / 10;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
          Halo, {firstName(user.name)}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isClient
            ? rows.length === 1
              ? "Ringkasan project yang bisa Anda lihat"
              : "Progress project yang terhubung ke akun Anda"
            : "Overview progress semua project"}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-16 text-center">
          <p className="font-medium text-slate-700">Belum ada project</p>
          <p className="mt-1 text-sm text-slate-500">
            {isClient
              ? "Project akan muncul di sini setelah Anda diundang."
              : "Buat project baru dari menu Project."}
          </p>
        </div>
      ) : rows.length === 1 ? (
        <FeaturedProject project={rows[0]!} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <StatCard
              label={isClient ? "Project Anda" : "Total project"}
              value={String(rows.length)}
            />
            <StatCard label="Berjalan" value={String(activeCount)} />
            <StatCard
              label="Rata-rata progress"
              value={`${avgProgress}%`}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((p) => (
              <ProjectProgressCard key={p.id} project={p} />
            ))}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Perbandingan progress
            </h2>
            <ChartOverview data={chartData} />
          </div>
        </>
      )}
    </div>
  );
}

function FeaturedProject({
  project,
}: {
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    progress: number;
    floorCount: number;
  };
}) {
  return (
    <Link
      href={`/project/${project.id}`}
      className="block overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-md"
    >
      <div className="bg-brand px-5 py-5 text-white sm:px-6 sm:py-6">
        <p className="text-xs font-medium uppercase tracking-wide text-white/70">
          Project
        </p>
        <h2 className="mt-1 text-xl font-bold sm:text-2xl">{project.name}</h2>
        {project.description && (
          <p className="mt-2 line-clamp-2 text-sm text-white/80">
            {project.description}
          </p>
        )}
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Progress keseluruhan</p>
            <p className="text-3xl font-bold tabular-nums text-slate-900">
              {project.progress}%
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            {statusLabel(project.status)}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${Math.min(100, project.progress)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            {project.floorCount} lantai
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-slate-900">
            Lihat project
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function ProjectProgressCard({
  project,
}: {
  project: {
    id: string;
    name: string;
    status: string;
    progress: number;
    floorCount: number;
  };
}) {
  return (
    <Link
      href={`/project/${project.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{project.name}</h3>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          {statusLabel(project.status)}
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">
        {project.progress}%
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.min(100, project.progress)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-400">{project.floorCount} lantai</p>
    </Link>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-5">
      <p className="text-xs text-slate-500 sm:text-sm">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">
        {value}
      </p>
    </div>
  );
}

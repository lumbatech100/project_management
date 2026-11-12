import Link from "next/link";

interface ProjectCardProps {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  progress: number;
  floorCount?: number;
}

export function ProjectCard({
  id,
  name,
  description,
  status,
  progress,
  floorCount,
}: ProjectCardProps) {
  return (
    <Link
      href={`/project/${id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{name}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            status === "active"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {status}
        </span>
      </div>
      {description && (
        <p className="mb-4 line-clamp-2 text-sm text-slate-500">{description}</p>
      )}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-slate-500">
          <span>
            Progress
            {floorCount != null ? ` · ${floorCount} lantai` : ""}
          </span>
          <span className="font-medium text-slate-700">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

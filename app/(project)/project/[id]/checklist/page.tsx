import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasMenu } from "@/lib/menus";
import { formatDateKey, getJakartaTodayDate, getJakartaParts } from "@/lib/workday";
import { buildChecklistMatrix } from "@/lib/checklist-matrix";
import { ChecklistProgressView } from "@/components/project/ChecklistProgressView";

function toDateKey(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") {
    return d.slice(0, 10);
  }
  // @db.Date → UTC midnight; use UTC parts
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0
  ) {
    return formatDateKey(d);
  }
  // timestamp → Jakarta calendar date
  const j = getJakartaParts(d);
  return `${j.year}-${String(j.month).padStart(2, "0")}-${String(j.day).padStart(2, "0")}`;
}

function latestActivityDate(item: {
  workDate: Date | null;
  doneAt: Date | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  progressLogs: { workDate: Date }[];
}): string | null {
  const keys: string[] = [];
  for (const log of item.progressLogs) {
    const k = toDateKey(log.workDate);
    if (k) keys.push(k);
  }
  for (const d of [
    item.workDate,
    item.approvedAt,
    item.submittedAt,
    item.doneAt,
  ]) {
    const k = toDateKey(d);
    if (k) keys.push(k);
  }
  if (keys.length === 0) return null;
  keys.sort();
  return keys[keys.length - 1]!;
}

export default async function ChecklistProgressPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await getSession();
  const menus = session?.user?.menus;
  if (!session?.user || !hasMenu(menus, "project.checklist")) {
    redirect(`/project/${params.id}/progress`);
  }

  const todayKey = formatDateKey(getJakartaTodayDate());

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      floors: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          markers: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              label: true,
              profileCode: true,
              hasKeyswitch: true,
              items: {
                orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                select: {
                  name: true,
                  bobot: true,
                  status: true,
                  done: true,
                  progressPct: true,
                  workDate: true,
                  doneAt: true,
                  submittedAt: true,
                  approvedAt: true,
                  progressLogs: {
                    select: { workDate: true },
                    orderBy: { workDate: "desc" },
                    take: 5,
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!project) notFound();

  const floors = project.floors.map((floor) => ({
    ...floor,
    markers: floor.markers.map((m) => ({
      ...m,
      items: m.items.map((item) => ({
        name: item.name,
        bobot: item.bobot,
        status: item.status,
        done: item.done,
        progressPct: item.progressPct,
        activityDate: latestActivityDate(item),
      })),
    })),
  }));

  return (
    <ChecklistProgressView
      projectId={project.id}
      matrix={buildChecklistMatrix(floors, todayKey)}
      todayKey={todayKey}
    />
  );
}

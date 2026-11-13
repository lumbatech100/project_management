import { prisma } from "@/lib/prisma";
import { getProjectProgress } from "@/lib/project-progress";
import {
  formatDateKey,
  getJakartaParts,
  getJakartaTodayDate,
} from "@/lib/workday";
import {
  buildChecklistMatrix,
  type ChecklistMatrix,
} from "@/lib/checklist-matrix";

function toDateKey(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  if (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0
  ) {
    return formatDateKey(d);
  }
  const j = getJakartaParts(d);
  return `${j.year}-${String(j.month).padStart(2, "0")}-${String(j.day).padStart(2, "0")}`;
}

function latestActivityDate(item: {
  workDate: Date | null;
  doneAt: Date | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
}): string | null {
  const keys: string[] = [];
  for (const d of [item.workDate, item.approvedAt, item.submittedAt, item.doneAt]) {
    const k = toDateKey(d);
    if (k) keys.push(k);
  }
  if (keys.length === 0) return null;
  keys.sort();
  return keys[keys.length - 1]!;
}

export async function getChecklistMeta(projectId: string) {
  const exists = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!exists) return null;
  const [floors, projectPct] = await Promise.all([
    prisma.floor.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    getProjectProgress(projectId),
  ]);
  return {
    todayKey: formatDateKey(getJakartaTodayDate()),
    projectPct,
    floors,
  };
}

export async function getChecklistPayload(
  projectId: string,
  floorId?: string | null
): Promise<{ todayKey: string; matrix: ChecklistMatrix } | null> {
  const todayKey = formatDateKey(getJakartaTodayDate());
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      floors: {
        where: floorId ? { id: floorId } : undefined,
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
                },
              },
            },
          },
        },
      },
    },
  });
  if (!project) return null;

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

  return { todayKey, matrix: buildChecklistMatrix(floors, todayKey) };
}

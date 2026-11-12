import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasMenu, type MenuKey } from "@/lib/menus";

const FIRST_PAGES: [MenuKey, string][] = [
  ["project.overview", "overview"],
  ["project.timeline", "timeline"],
  ["project.progress", "progress"],
  ["project.approval", "approval"],
  ["project.checklist", "checklist"],
  ["project.laporan", "laporan"],
  ["project.inventory", "inventory"],
  ["project.po", "po"],
  ["project.dokumen", "dokumen"],
  ["project.cost", "cost"],
  ["project.absen", "absen"],
  ["project.pekerja", "pekerja"],
  ["project.details", "details"],
];

export default async function ProjectDetailIndex(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await getSession();
  const menus = session?.user?.menus || [];
  const dest =
    FIRST_PAGES.find(([key]) => hasMenu(menus, key))?.[1] ?? "progress";
  redirect(`/project/${params.id}/${dest}`);
}

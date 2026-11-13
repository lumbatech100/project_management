import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasMenu } from "@/lib/menus";
import { getChecklistPayload } from "@/lib/checklist-data";
import { ChecklistProgressView } from "@/components/project/ChecklistProgressView";

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

  const payload = await getChecklistPayload(params.id);
  if (!payload) notFound();

  return (
    <ChecklistProgressView
      projectId={params.id}
      matrix={payload.matrix}
      todayKey={payload.todayKey}
    />
  );
}

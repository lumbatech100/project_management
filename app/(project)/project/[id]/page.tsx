import { redirect } from "next/navigation";

export default function ProjectDetailIndex({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/project/${params.id}/overview`);
}

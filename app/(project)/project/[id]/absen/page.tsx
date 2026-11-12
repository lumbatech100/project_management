import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getAttendanceAccess, hasAttendanceAccess } from "@/lib/attendance";
import { AbsenView } from "@/components/project/AbsenView";

export default async function AbsenPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const session = await getSession();
  if (!session?.user) notFound();

  const access = await getAttendanceAccess(session.user, params.id);
  if (!hasAttendanceAccess(access)) notFound();

  return <AbsenView projectId={params.id} canManage={access.canManage} />;
}

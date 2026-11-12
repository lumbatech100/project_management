import { GroupInviteForm } from "@/components/GroupInviteForm";

export default async function IsiDataGrupPage(
  props: {
    params: Promise<{ token: string }>;
  }
) {
  const params = await props.params;
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 px-4 py-10">
      <GroupInviteForm token={params.token} />
    </div>
  );
}

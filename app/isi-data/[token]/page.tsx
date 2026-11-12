import { WorkerInviteForm } from "@/components/WorkerInviteForm";

export default async function IsiDataPage(
  props: {
    params: Promise<{ token: string }>;
  }
) {
  const params = await props.params;
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 px-4 py-10">
      <WorkerInviteForm token={params.token} />
    </div>
  );
}

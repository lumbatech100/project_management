import { redirect } from "next/navigation";

export default async function InventoryPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  redirect(`/project/${params.id}/inventory/stok`);
}

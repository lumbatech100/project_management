import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/** Auth gate — UI shell project ada di project/[id]/layout */
export default async function ProjectWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  return children;
}

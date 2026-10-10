import { AdminDashboard } from "@/components/admin/admin-dashboard";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminDashboard section="workspaces" id={id} />;
}

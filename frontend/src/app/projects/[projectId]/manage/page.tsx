import { OwnerDashboard } from "@/components/owner-dashboard";
export default async function ManageProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { projectId } = await params;
  const { tab } = await searchParams;
  const selected =
    tab === "applications" || tab === "team" || tab === "settings"
      ? tab
      : "overview";
  return <OwnerDashboard projectId={projectId} tab={selected} />;
}

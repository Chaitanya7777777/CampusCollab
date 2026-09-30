import { ProjectEditor } from "@/components/project-editor";
export default async function EditProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { projectId } = await params;
  const { saved } = await searchParams;
  return <ProjectEditor projectId={projectId} saved={saved === "1"} />;
}

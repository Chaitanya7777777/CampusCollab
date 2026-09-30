import { ProjectDetails } from "@/components/project-details";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectDetails projectId={projectId} />;
}

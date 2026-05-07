import { listWorkflows } from "@/lib/canvas/actions";
import { WorkflowsPage } from "@/components/workflows/workflows-page";

export default async function Home() {
  const workflows = await listWorkflows();
  return <WorkflowsPage initialWorkflows={workflows} />;
}

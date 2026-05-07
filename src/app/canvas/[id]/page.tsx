import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CanvasEditor } from "@/components/canvas/canvas-editor";
import type { CanvasEdgeRow, CanvasNodeRow } from "@/lib/canvas/types";

export default async function CanvasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: workflow } = await supabase
    .from("workflows")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!workflow) notFound();

  const [{ data: nodes }, { data: edges }] = await Promise.all([
    supabase.from("nodes").select("*").eq("workflow_id", id),
    supabase.from("edges").select("*").eq("workflow_id", id),
  ]);

  return (
    <CanvasEditor
      workflowId={id}
      workflowName={workflow.name}
      initialNodes={(nodes ?? []) as CanvasNodeRow[]}
      initialEdges={(edges ?? []) as CanvasEdgeRow[]}
    />
  );
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runWorkflow } from "@/lib/workflow/execute";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: workflow } = await supabase
    .from("workflows")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!workflow) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    await runWorkflow({ supabase, userId: user.id, workflowId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

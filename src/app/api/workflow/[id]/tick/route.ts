import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tickWorkflow } from "@/lib/workflow/execute";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // `cascade` controls whether the tick auto-dispatches newly-ready downstream
  // nodes. Default is true (Run-all behavior); per-node runs send false.
  // `sequential` (only relevant when cascade=true) limits dispatch to one
  // token-spending node at a time.
  const body = (await request.json().catch(() => ({}))) as {
    cascade?: boolean;
    sequential?: boolean;
  };
  const cascade = body.cascade !== false;
  const sequential = body.sequential === true;

  try {
    const result = await tickWorkflow(
      { supabase, userId: user.id, workflowId: id },
      { cascade, sequential },
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

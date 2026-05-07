import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runWorkflow } from "@/lib/workflow/execute";

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

  const { data: workflow } = await supabase
    .from("workflows")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!workflow) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // `sequential`: only dispatch one token-spending node at a time.
  const body = (await request.json().catch(() => ({}))) as {
    sequential?: boolean;
  };

  try {
    await runWorkflow(
      { supabase, userId: user.id, workflowId: id },
      { sequential: body.sequential === true },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

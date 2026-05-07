import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runSingleNode } from "@/lib/workflow/execute";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
) {
  const { id, nodeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const result = await runSingleNode(
      { supabase, userId: user.id, workflowId: id },
      nodeId,
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

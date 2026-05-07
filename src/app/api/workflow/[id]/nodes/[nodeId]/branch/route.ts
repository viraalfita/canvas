import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { branchNode } from "@/lib/workflow/execute";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; nodeId: string }> },
) {
  const { id, nodeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    params?: Record<string, unknown>;
    imageUrl?: string | null;
  };

  try {
    const result = await branchNode(
      { supabase, userId: user.id, workflowId: id },
      nodeId,
      body.params ?? {},
      body.imageUrl ?? null,
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

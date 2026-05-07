import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enhancePrompt } from "@/lib/llm/enhance";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    idea?: string;
    kind?: "image" | "video";
    model?: string;
  };
  if (!body.idea?.trim()) {
    return NextResponse.json(
      { error: "Type your idea first, then click ✨ Enhance." },
      { status: 400 },
    );
  }

  try {
    const prompt = await enhancePrompt({
      idea: body.idea,
      kind: body.kind === "video" ? "video" : "image",
      model: body.model,
    });
    return NextResponse.json({ prompt });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

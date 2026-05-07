import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateStoryboard } from "@/lib/llm/storyboard";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    story?: string;
    sceneCount?: number;
    style?: string;
    totalDuration?: number;
    model?: string;
  };

  try {
    const scenes = await generateStoryboard({
      story: body.story ?? "",
      sceneCount: body.sceneCount ?? 3,
      style: body.style,
      totalDuration: body.totalDuration ?? 15,
      model: body.model,
    });
    return NextResponse.json({ scenes });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

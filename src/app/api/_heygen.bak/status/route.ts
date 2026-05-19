import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStatus } from "@/lib/heygen/client";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const status = await getStatus();
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json(
      { connected: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

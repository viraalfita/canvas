import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listVoices } from "@/lib/heygen/client";

// HeyGen voice catalog changes rarely; cache 1h to keep the dropdown snappy.
// Manual refresh from the UI bypasses cache via `?refresh=1`.
export const revalidate = 3600;

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";

  try {
    const voices = await listVoices();
    return NextResponse.json(
      { voices },
      refresh
        ? { headers: { "cache-control": "no-store" } }
        : { headers: { "cache-control": "s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

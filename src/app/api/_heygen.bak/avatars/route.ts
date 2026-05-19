import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listAvatars } from "@/lib/heygen/client";

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
    const avatars = await listAvatars();
    return NextResponse.json(
      { avatars },
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

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { connectUrl } from "@/lib/heygen/client";

/**
 * Entry point for the "Connect HeyGen" button. Bouncing through this route
 * (vs the bridge URL directly) lets us enforce Canvas auth before exposing
 * the OAuth flow.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return NextResponse.redirect(connectUrl(), 302);
}

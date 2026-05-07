import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/apimart/client";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const res = await getBalance();
    return NextResponse.json({
      remain: res.remain_balance,
      used: res.used_balance,
      unlimited: res.unlimited_quota,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

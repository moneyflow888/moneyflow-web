import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabasePublic() {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY!;
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  return createClient(url, anon, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    const supabase = getSupabasePublic();

    const { data, error } = await supabase
      .from("wtd_adjustments")
      .select("id, week_start, delta_usd, note, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

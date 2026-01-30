import { NextResponse } from "next/server";
import { supabasePublic } from "@/lib/supabasePublic";

export async function GET() {
  const { data, error } = await supabasePublic
    .from("nav_snapshots")
    .select("timestamp,total_nav,change_24h,change_24h_pct")
    .order("timestamp", { ascending: false })
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data?.[0] ?? {});
}

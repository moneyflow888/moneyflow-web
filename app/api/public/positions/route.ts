import { NextResponse } from "next/server";
import { supabasePublic } from "@/lib/supabasePublic";

export async function GET() {
  const latest = await supabasePublic
    .from("position_snapshots")
    .select("timestamp")
    .order("timestamp", { ascending: false })
    .limit(1);

  if (latest.error) return NextResponse.json({ error: latest.error.message }, { status: 500 });

  const ts = latest.data?.[0]?.timestamp;
  if (!ts) return NextResponse.json([]);

  const { data, error } = await supabasePublic
    .from("position_snapshots")
    .select("timestamp,source,position_key,asset_symbol,amount,value_usdt,chain,category,meta")
    .eq("timestamp", ts)
    .order("value_usdt", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supabasePublic() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createClient(url, anonKey, {
    auth: { persistSession: false },
  });
}

export async function GET() {
  try {
    const supabase = supabasePublic();

    const { data, error } = await supabase
      .from("principal_adjustments")
      .select("id, month, delta, note, created_at")
      .order("created_at", { ascending: true });

    if (error) throw error;

    const total = (data ?? []).reduce(
      (acc, r: any) => acc + Number(r.delta ?? 0),
      0
    );

    return NextResponse.json({
      total_principal: total,
      rows: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

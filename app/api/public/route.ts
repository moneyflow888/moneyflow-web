import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: rows, error } = await supabase
      .from("principal_adjustments")
      .select("id, month, delta, note, created_at")
      .order("created_at", { ascending: true });

    if (error) throw error;

    const total_principal = (rows ?? []).reduce((acc, r: any) => acc + Number(r.delta || 0), 0);

    return NextResponse.json({ total_principal, rows: rows ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

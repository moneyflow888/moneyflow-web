import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidWeekStart(s: string) {
  // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime());
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !service) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, service, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const c = await cookies();
    const v = c.get("mf_admin")?.value;
    if (v !== "1") {
      return NextResponse.json({ error: "Unauthorized: mf_admin cookie required" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const week_start = String(body.week_start ?? "").slice(0, 10);
    const delta_usd = Number(body.delta_usd);
    const note = body.note == null ? null : String(body.note).trim() || null;

    if (!isValidWeekStart(week_start)) {
      return NextResponse.json({ error: "Invalid week_start (YYYY-MM-DD)" }, { status: 400 });
    }
    if (!Number.isFinite(delta_usd) || delta_usd === 0) {
      return NextResponse.json({ error: "delta_usd must be a non-zero number" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("wtd_adjustments")
      .insert([{ week_start, delta_usd, note }])
      .select("id, week_start, delta_usd, note, created_at")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, row: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

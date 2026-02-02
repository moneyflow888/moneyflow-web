import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

function requireAdmin(req: Request) {
  const token = req.headers.get("x-admin-token") || "";
  const expect = process.env.ADMIN_TOKEN || "";
  if (!expect) throw new Error("Missing ADMIN_TOKEN in server env");
  return token === expect;
}

/**
 * GET /api/admin/principal
 * 只是提示用（避免你用瀏覽器打開看到 405）
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Use POST to create principal adjustment. (This endpoint is not for browser GET)",
  });
}

/**
 * POST /api/admin/principal
 * body: { month: "YYYY-MM", delta: number, note?: string | null }
 */
export async function POST(req: Request) {
  try {
    if (!requireAdmin(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const month = String(body.month || "").slice(0, 7);
    const delta = Number(body.delta);
    const note = body.note == null ? null : String(body.note);

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
    }
    if (!Number.isFinite(delta) || delta === 0) {
      return NextResponse.json({ error: "delta must be a non-zero number" }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("principal_adjustments")
      .insert([{ month, delta, note }])
      .select("id, month, delta, note, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, row: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

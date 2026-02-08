// app/api/admin/withdraw-queue/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

function isAdmin(req: Request) {
  const token = req.headers.get("x-admin-token") || "";
  return token && process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN;
}

export async function GET(req: Request) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sb = getSupabaseAdmin();

    // 只讀：列出最新 200 筆（你可自行調整）
    const { data, error } = await sb
      .from("investor_withdraw_requests")
      .select("id,user_id,amount,status,note,created_at,updated_at,executed_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return NextResponse.json({ rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

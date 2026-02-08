import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdminCookie() {
  const c = await cookies(); // ✅ Next.js 16: cookies() is async
  const v = c.get("mf_admin")?.value;
  if (v !== "1") throw new Error("Unauthorized");
}

export async function GET(req: Request) {
  try {
    await requireAdminCookie();

    const sb = supabaseAdmin();

    // 只讀：列出最新 200 筆（你可自行調整）
    const { data, error } = await sb
      .from("investor_withdraw_requests")
      .select("id,user_id,amount,status,note,created_at,updated_at,executed_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return NextResponse.json({ ok: true, rows: data ?? [] });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function requireAdminCookie() {
  // /api/admin/login 會設 mf_admin=1 (HttpOnly)
  const c = await cookies(); // ✅ Next.js 16: cookies() is async
  const v = c.get("mf_admin")?.value;
  if (v !== "1") throw new Error("Unauthorized");
}

export async function GET(req: Request) {
  try {
    await requireAdminCookie();
    const supabase = supabaseAdmin();

    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "PENDING";

    const { data, error } = await supabase
      .from("investor_deposit_requests")
      .select(
        "id, user_id, amount, status, note, created_at, executed_at, share_price_used, minted_shares"
      )
      .eq("status", status)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, status, rows: data ?? [] });
  } catch (e: any) {
    const msg = e?.message ?? "error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

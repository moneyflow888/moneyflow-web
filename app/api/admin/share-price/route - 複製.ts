import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * ✅ cookie-only admin 驗證
 * Next.js 16：cookies() 是 async
 * 只認 HttpOnly cookie：mf_admin=1
 */
async function requireAdminCookie() {
  const c = await cookies();
  const v = c.get("mf_admin")?.value;
  if (v !== "1") throw new Error("Unauthorized");
}

async function getFundNav(supabase: ReturnType<typeof supabaseAdmin>) {
  const { data, error } = await supabase
    .from("nav_snapshots")
    .select("total_nav, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const nav = Number(data?.total_nav ?? 0);
  return { nav, created_at: data?.created_at ?? null };
}

async function getTotalShares(supabase: ReturnType<typeof supabaseAdmin>) {
  const { data, error } = await supabase.from("investor_accounts").select("shares");
  if (error) throw error;

  const totalShares = (data ?? []).reduce(
    (acc, r: any) => acc + Number(r.shares ?? 0),
    0
  );

  return totalShares;
}

export async function GET(req: Request) {
  try {
    await requireAdminCookie();
    const supabase = supabaseAdmin();

    const [{ nav, created_at }, totalShares] = await Promise.all([
      getFundNav(supabase),
      getTotalShares(supabase),
    ]);

    const sharePrice = totalShares > 0 ? nav / totalShares : null;

    return NextResponse.json({
      nav,
      nav_created_at: created_at,
      total_shares: totalShares,
      share_price: sharePrice,
    });
  } catch (e: any) {
    const msg = e?.message ?? "error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

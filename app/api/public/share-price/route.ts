import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  try {
    // ✅ 只讀：用 service role 讀 nav_snapshots（不會暴露到 client，安全）
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("nav_snapshots")
      .select("total_nav, total_shares, share_price, created_at, timestamp")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const totalNav = num(data?.total_nav);
    const totalShares = data?.total_shares == null ? null : num(data.total_shares);
    const storedSharePrice = data?.share_price == null ? null : num(data.share_price);

    // share_price 以資料表為主；若沒存但 total_shares 有值，可用 nav/total_shares 推回
    const sharePrice =
      storedSharePrice && storedSharePrice > 0
        ? storedSharePrice
        : totalShares && totalShares > 0
          ? totalNav / totalShares
          : null;

    return NextResponse.json({
      share_price: sharePrice,
      nav_created_at: data?.created_at ?? null,
      nav_timestamp: data?.timestamp ?? null,
      total_nav: totalNav,
      total_shares: totalShares,
      note:
        sharePrice == null
          ? "share_price unavailable: latest nav_snapshots row must contain share_price OR total_shares (recommended: store both in snapshot runner)."
          : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}

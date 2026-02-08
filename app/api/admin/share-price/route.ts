// app/api/admin/share-price/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * ✅ cookie-only admin 驗證
 * Next.js：cookies() 是 async
 * 只認 HttpOnly cookie：mf_admin=1
 */
async function requireAdminCookie() {
  const c = await cookies();
  const v = c.get("mf_admin")?.value;
  if (v !== "1") throw new Error("Unauthorized");
}

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * ✅ 只相信「最新 NAV snapshot」裡的 share_price / total_shares
 * ❌ 不再用 investor_accounts 的即時 sum(shares) 當分母（會造成剛入金就虧損）
 */
async function getLatestNavSnapshot(supabase: ReturnType<typeof supabaseAdmin>) {
  const { data, error } = await supabase
    .from("nav_snapshots")
    .select("id, total_nav, total_shares, share_price, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const nav = num((data as any)?.total_nav ?? 0);
  const totalShares = (data as any)?.total_shares ?? null;
  const sharePrice = (data as any)?.share_price ?? null;

  return {
    id: (data as any)?.id ?? null,
    nav,
    total_shares: totalShares,
    share_price: sharePrice,
    created_at: (data as any)?.created_at ?? null,
  };
}

export async function GET(_req: Request) {
  try {
    await requireAdminCookie();
    const supabase = supabaseAdmin();

    const snap = await getLatestNavSnapshot(supabase);

    if (!snap.created_at) {
      return NextResponse.json({ error: "nav snapshot missing created_at" }, { status: 400 });
    }

    // ✅ 1) 優先用 nav_snapshots.share_price
    const sp = Number(snap.share_price);
    if (Number.isFinite(sp) && sp > 0) {
      const ts = Number(snap.total_shares);
      return NextResponse.json({
        nav: snap.nav,
        nav_created_at: snap.created_at,
        nav_snapshot_id: snap.id,
        total_shares: Number.isFinite(ts) ? ts : null,
        share_price: sp,
        share_price_source: "nav_snapshots.share_price",
      });
    }

    // ✅ 2) 次選：nav_snapshots.total_nav / nav_snapshots.total_shares
    const ts = Number(snap.total_shares);
    if (Number.isFinite(ts) && ts > 0 && snap.nav > 0) {
      const calc = snap.nav / ts;
      if (Number.isFinite(calc) && calc > 0) {
        return NextResponse.json({
          nav: snap.nav,
          nav_created_at: snap.created_at,
          nav_snapshot_id: snap.id,
          total_shares: ts,
          share_price: calc,
          share_price_source: "nav_snapshots.total_nav/total_shares",
        });
      }
    }

    // ❌ 不再 fallback 用 investor_accounts sum(shares)
    //    因為 execute-deposits 會改 shares，會讓 share_price “瞬間變動” → 入金立刻虧損
    return NextResponse.json(
      {
        error:
          "share_price unavailable: latest nav_snapshots row must contain share_price OR total_shares (recommended: store both in snapshot runner).",
        nav_created_at: snap.created_at,
        nav_snapshot_id: snap.id,
        nav: snap.nav,
        total_shares: snap.total_shares,
        share_price: snap.share_price,
      },
      { status: 400 }
    );
  } catch (e: any) {
    const msg = e?.message ?? "error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

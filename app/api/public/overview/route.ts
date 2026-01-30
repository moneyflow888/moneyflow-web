import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client for Next.js Route Handler
 * - Prefer server env: SUPABASE_URL / SUPABASE_ANON_KEY
 * - Fallback to NEXT_PUBLIC_* for convenience
 */
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

if (!SUPABASE_URL) {
  throw new Error(
    "Missing Supabase URL. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in moneyflow-web/.env.local"
  );
}
if (!SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing Supabase anon key. Set SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in moneyflow-web/.env.local"
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

type PositionOut = {
  category: string;
  source: string;
  asset: string;
  amount: number | null;
  value_usdt: number | null;
  chain: string;
};

export async function GET() {
  try {
    // 1) latest nav
    const { data: navRows, error: navErr } = await supabase
      .from("nav_snapshots")
      .select("timestamp,total_nav,change_24h,change_24h_pct")
      .order("timestamp", { ascending: false })
      .limit(1);

    if (navErr) throw navErr;
    const nav = navRows?.[0];

    // 2) nav history (for line chart)
    const { data: navHistory, error: histErr } = await supabase
      .from("nav_snapshots")
      .select("timestamp,total_nav")
      .order("timestamp", { ascending: true })
      .limit(200);

    if (histErr) throw histErr;

    // 3) latest positions timestamp
    const { data: latestPos, error: latestPosErr } = await supabase
      .from("position_snapshots")
      .select("timestamp")
      .order("timestamp", { ascending: false })
      .limit(1);

    if (latestPosErr) throw latestPosErr;
    const latestTs = latestPos?.[0]?.timestamp ?? null;

    let positions: PositionOut[] = [];

    if (latestTs) {
      // 4) fetch positions exactly at latest timestamp (DB-side equality)
      const { data: posRows, error: posErr } = await supabase
        .from("position_snapshots")
        .select("category,source,asset_symbol,amount,value_usdt,chain")
        .eq("timestamp", latestTs)
        .order("value_usdt", { ascending: false });

      if (posErr) throw posErr;

      positions = (posRows ?? []).map((p: any) => ({
        category: String(p.category ?? ""),
        source: String(p.source ?? ""),
        asset: String(p.asset_symbol ?? ""),
        amount: p.amount === null || p.amount === undefined ? null : Number(p.amount),
        value_usdt:
          p.value_usdt === null || p.value_usdt === undefined ? null : Number(p.value_usdt),
        chain: String(p.chain ?? ""),
      }));
    }

    // 5) allocation by category
    const allocMap = new Map<string, number>();
    for (const p of positions) {
      const v = Number(p.value_usdt ?? 0);
      allocMap.set(p.category, (allocMap.get(p.category) ?? 0) + v);
    }

    const allocation = Array.from(allocMap.entries()).map(([category, value_usdt]) => ({
      category,
      label: category === "wallet" ? "Wallet" : category === "cex" ? "CEX (OKX)" : "DeFi",
      value_usdt,
    }));

    // 6) distribution by chain
    const chainMap = new Map<string, number>();
    for (const p of positions) {
      const v = Number(p.value_usdt ?? 0);
      chainMap.set(p.chain, (chainMap.get(p.chain) ?? 0) + v);
    }

    const distribution = Array.from(chainMap.entries()).map(([chain, value_usdt]) => ({
      chain,
      value_usdt,
    }));

    // 7) If nav is missing, still return a valid shape
    if (!nav) {
      return NextResponse.json({
        header: { title: "MoneyFlow Dashboard", last_update: latestTs, tags: ["public", "USDT"] },
        kpi: { total_nav: 0, change_24h: 0, change_24h_pct: 0, diff_mode: "none" },
        allocation,
        nav_history: (navHistory ?? []).map((r: any) => ({
          timestamp: r.timestamp,
          total_nav: Number(r.total_nav ?? 0),
        })),
        distribution,
        positions,
      });
    }

    // 8) Normal response
    return NextResponse.json({
      header: {
        title: "MoneyFlow Dashboard",
        last_update: nav.timestamp,
        tags: ["public", "USDT"],
      },
      kpi: {
        total_nav: Number(nav.total_nav ?? 0),
        change_24h: nav.change_24h === null ? null : Number(nav.change_24h),
        change_24h_pct: nav.change_24h_pct === null ? null : Number(nav.change_24h_pct),
        diff_mode: "prev_or_24h",
      },
      allocation,
      nav_history: (navHistory ?? []).map((r: any) => ({
        timestamp: r.timestamp,
        total_nav: Number(r.total_nav ?? 0),
      })),
      distribution,
      positions,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}

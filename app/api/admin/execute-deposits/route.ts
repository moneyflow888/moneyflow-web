// app/api/admin/execute-deposits/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function requireAdminCookie() {
  const c = await cookies(); // Next.js: cookies() is async
  const v = c.get("mf_admin")?.value;
  if (v !== "1") throw new Error("Unauthorized");
}

function monthKeyNow() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * ✅ 取「最新 nav_snapshot」並優先使用：
 * - nav_snapshots.share_price（若存在）
 * - 否則 nav_snapshots.total_nav / nav_snapshots.total_shares（若存在）
 * - 再不行才 fallback 用 investor_accounts 合計 shares 去算（舊方法）
 *
 * 目標：讓 execute-deposits 用的 share_price 與投資頁 /api/admin/share-price 來源一致
 */
async function getLatestNavAndSharePrice(supabase: ReturnType<typeof supabaseAdmin>) {
  // 1) latest NAV snapshot (盡量把可能存在的欄位都 select 出來；不存在也沒關係)
  const { data: navRow, error: navErr } = await supabase
    .from("nav_snapshots")
    .select("id, total_nav, total_shares, share_price, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (navErr) throw navErr;

  const nav = num((navRow as any)?.total_nav ?? 0);
  const navCreatedAt = (navRow as any)?.created_at ?? null;
  const navId = (navRow as any)?.id ?? null;

  // 2) totals across all investors (for principal cap + fallback)
  const { data: accounts, error: accErr } = await supabase
    .from("investor_accounts")
    .select("shares, principal");

  if (accErr) throw accErr;

  const totalSharesFromAccounts = (accounts ?? []).reduce((acc, r: any) => acc + num(r.shares), 0);
  const totalPrincipal = (accounts ?? []).reduce((acc, r: any) => acc + num(r.principal), 0);

  // 3) share_price：優先用 nav_snapshots 裡的 share_price
  const spFromSnapshot = Number((navRow as any)?.share_price);
  if (Number.isFinite(spFromSnapshot) && spFromSnapshot > 0) {
    return {
      nav,
      navCreatedAt,
      navId,
      totalShares: totalSharesFromAccounts,
      totalPrincipal,
      sharePrice: spFromSnapshot,
      sharePriceSource: "nav_snapshots.share_price" as const,
    };
  }

  // 4) 次選：用 nav_snapshots.total_nav / nav_snapshots.total_shares
  const snapshotTotalShares = Number((navRow as any)?.total_shares);
  if (Number.isFinite(snapshotTotalShares) && snapshotTotalShares > 0 && nav > 0) {
    const sp = nav / snapshotTotalShares;
    if (Number.isFinite(sp) && sp > 0) {
      return {
        nav,
        navCreatedAt,
        navId,
        totalShares: totalSharesFromAccounts,
        totalPrincipal,
        sharePrice: sp,
        sharePriceSource: "nav_snapshots.total_nav/total_shares" as const,
      };
    }
  }

  // 5) fallback：舊方法（用 investor_accounts shares 合計）
  const fallbackSharePrice = totalSharesFromAccounts > 0 ? nav / totalSharesFromAccounts : null;

  return {
    nav,
    navCreatedAt,
    navId,
    totalShares: totalSharesFromAccounts,
    totalPrincipal,
    sharePrice: fallbackSharePrice,
    sharePriceSource: "fallback(nav/totalSharesFromAccounts)" as const,
  };
}

/**
 * ✅ 更新 deposit request（兼容你 DB 可能還沒加 nav_snapshot_id 欄位）
 * - 先嘗試寫 nav_snapshot_id
 * - 若 DB 沒此欄位會報錯 → 自動重試（不含 nav_snapshot_id）
 */
async function updateDepositRequestCompat(
  supabase: ReturnType<typeof supabaseAdmin>,
  args: {
    id: number;
    nowIso: string;
    sharePriceUsed: number;
    mintedShares: number;
    navSnapshotId: any;
  }
) {
  const basePayload: any = {
    status: "MINTED",
    executed_at: args.nowIso,
    share_price_used: args.sharePriceUsed,
    minted_shares: args.mintedShares,
    updated_at: args.nowIso,
  };

  // 先 try 寫 nav_snapshot_id
  try {
    const payloadWithNavId = { ...basePayload, nav_snapshot_id: args.navSnapshotId };
    const { error } = await supabase.from("investor_deposit_requests").update(payloadWithNavId).eq("id", args.id);
    if (error) throw error;
    return { ok: true, wrote_nav_snapshot_id: true };
  } catch {
    // fallback：不含 nav_snapshot_id
    const { error } = await supabase.from("investor_deposit_requests").update(basePayload).eq("id", args.id);
    if (error) throw error;
    return { ok: true, wrote_nav_snapshot_id: false };
  }
}

export async function POST(_req: Request) {
  try {
    await requireAdminCookie();
    const supabase = supabaseAdmin();

    // 1) ✅ 當下使用「最新 nav_snapshot」的 share_price（與投資頁一致）
    const { nav, navCreatedAt, navId, totalShares, totalPrincipal, sharePrice, sharePriceSource } =
      await getLatestNavAndSharePrice(supabase);

    if (!navCreatedAt) {
      return NextResponse.json({ error: "nav_created_at missing" }, { status: 400 });
    }

    if (!sharePrice || !Number.isFinite(sharePrice) || sharePrice <= 0) {
      return NextResponse.json({ error: "share_price unavailable" }, { status: 400 });
    }

    // 2) 取所有待結算入金
    const { data: deposits, error: depErr } = await supabase
      .from("investor_deposit_requests")
      .select("id, user_id, amount, status, note, created_at")
      .eq("status", "PENDING")
      .order("created_at", { ascending: true });

    if (depErr) throw depErr;

    const pending = deposits ?? [];
    if (pending.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "no pending deposits",
        nav_used: nav,
        nav_created_at: navCreatedAt,
        nav_snapshot_id: navId,
        total_shares_before: totalShares,
        total_principal_before: totalPrincipal,
        share_price_used: sharePrice,
        share_price_source: sharePriceSource,
        executed: 0,
      });
    }

    const nowIso = new Date().toISOString();
    const navTs = new Date(navCreatedAt).getTime();

    // 3) 全體 principal 上限（含逐筆累加，避免同批多筆超過 NAV）
    const EPS = 1e-6;
    let principalRunning = totalPrincipal;
    const results: any[] = [];

    for (const d of pending) {
      const amount = num(d.amount);
      const depCreatedAt = d.created_at ?? null;
      const depTs = depCreatedAt ? new Date(depCreatedAt).getTime() : NaN;

      if (!Number.isFinite(amount) || amount <= 0) {
        results.push({ id: d.id, ok: false, reason: "invalid amount" });
        continue;
      }

      // ✅ gate：nav_created_at 必須 >= deposit_created_at
      if (!depCreatedAt || !Number.isFinite(depTs) || navTs < depTs) {
        results.push({
          id: d.id,
          ok: false,
          reason: "nav too old (require nav_created_at >= deposit_created_at)",
          nav_created_at: navCreatedAt,
          deposit_created_at: depCreatedAt,
        });
        continue;
      }

      // ✅ principal（含本筆）不得 > NAV（你原本的保護邏輯保留）
      if (principalRunning + amount > nav + EPS) {
        results.push({
          id: d.id,
          ok: false,
          reason: "blocked: total principal would exceed NAV",
          nav_used: nav,
          total_principal_before: principalRunning,
          attempted_deposit: amount,
          total_principal_after: principalRunning + amount,
        });
        continue;
      }

      // ✅ mint shares：用「本次 nav_snapshot 的 share_price」
      const mintedShares = amount / sharePrice;

      // 讀帳戶
      const { data: acct, error: acctErr } = await supabase
        .from("investor_accounts")
        .select("user_id, shares, principal")
        .eq("user_id", d.user_id)
        .maybeSingle();

      if (acctErr) throw acctErr;
      if (!acct) {
        results.push({ id: d.id, ok: false, reason: "account not found" });
        continue;
      }

      const currentShares = num((acct as any).shares);
      const currentPrincipal = num((acct as any).principal);

      const newShares = currentShares + mintedShares;
      const newPrincipal = currentPrincipal + amount;

      // 1) 更新 investor_accounts：shares + principal
      const { error: updAccErr } = await supabase
        .from("investor_accounts")
        .update({
          shares: newShares,
          principal: newPrincipal,
          updated_at: nowIso,
        })
        .eq("user_id", d.user_id);

      if (updAccErr) throw updAccErr;

      // 2) 更新 deposit request：MINTED + share_price_used + minted_shares (+ nav_snapshot_id if exists)
      const updReq = await updateDepositRequestCompat(supabase, {
        id: d.id,
        nowIso,
        sharePriceUsed: sharePrice,
        mintedShares,
        navSnapshotId: navId,
      });

      // 3) principal_adjustments：Dashboard PnL-only 抵消入金
      const { error: insAdjErr } = await supabase.from("principal_adjustments").insert([
        {
          month: monthKeyNow(),
          delta: amount,
          note: `auto: deposit minted user=${d.user_id} deposit_id=${d.id} nav_id=${navId ?? "null"}`,
          created_at: nowIso,
        },
      ]);

      if (insAdjErr) throw insAdjErr;

      principalRunning += amount;

      results.push({
        id: d.id,
        ok: true,
        user_id: d.user_id,
        amount,
        nav_snapshot_id: navId,
        nav_created_at: navCreatedAt,
        share_price_used: sharePrice,
        share_price_source: sharePriceSource,
        minted_shares: mintedShares,
        new_shares: newShares,
        new_principal: newPrincipal,
        wrote_nav_snapshot_id: updReq.wrote_nav_snapshot_id,
      });
    }

    const executed = results.filter((r) => r.ok).length;

    return NextResponse.json({
      ok: true,
      nav_used: nav,
      nav_created_at: navCreatedAt,
      nav_snapshot_id: navId,
      total_shares_before: totalShares,
      total_principal_before: totalPrincipal,
      share_price_used: sharePrice,
      share_price_source: sharePriceSource,
      executed,
      results,
    });
  } catch (e: any) {
    const msg = e?.message ?? "error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

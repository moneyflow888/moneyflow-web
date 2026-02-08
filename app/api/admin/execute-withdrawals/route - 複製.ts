import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function requireAdminCookie() {
  const v = cookies().get("mf_admin")?.value;
  if (v !== "1") throw new Error("Unauthorized");
}

async function getNavAndTotalShares(supabase: ReturnType<typeof supabaseAdmin>) {
  const { data: navRow, error: navErr } = await supabase
    .from("nav_snapshots")
    .select("total_nav, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (navErr) throw navErr;

  const { data: accounts, error: accErr } = await supabase
    .from("investor_accounts")
    .select("shares");
  if (accErr) throw accErr;

  const nav = Number(navRow?.total_nav ?? 0);
  const navCreatedAt = navRow?.created_at ?? null;

  const totalShares = (accounts ?? []).reduce(
    (acc, r: any) => acc + Number(r.shares ?? 0),
    0
  );

  const sharePrice = totalShares > 0 ? nav / totalShares : null;
  return { nav, navCreatedAt, totalShares, sharePrice };
}

export async function POST(req: Request) {
  try {
    requireAdminCookie();
    const supabase = supabaseAdmin();

    // 1) 取當下 share_price
    const { nav, navCreatedAt, totalShares, sharePrice } =
      await getNavAndTotalShares(supabase);

    if (!sharePrice || !Number.isFinite(sharePrice) || sharePrice <= 0) {
      throw new Error("share_price unavailable (total_shares=0?)");
    }

    // 2) 找所有 pending 提款
    const { data: reqs, error: reqErr } = await supabase
      .from("investor_withdraw_requests")
      .select("id, user_id, amount, status")
      .eq("status", "PENDING");
    if (reqErr) throw reqErr;

    const pending = reqs ?? [];
    if (pending.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "no pending withdrawals",
        nav_used: nav,
        nav_created_at: navCreatedAt,
        total_shares: totalShares,
        share_price_used: sharePrice,
        executed: 0,
      });
    }

    const results: any[] = [];
    const nowIso = new Date().toISOString();

    // 3) 逐筆結算（簡單穩定版）
    for (const w of pending) {
      const amount = Number(w.amount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        results.push({ id: w.id, ok: false, reason: "invalid amount" });
        continue;
      }

      const burnShares = amount / sharePrice;

      // 3.1 讀投資人 shares
      const { data: acct, error: acctErr } = await supabase
        .from("investor_accounts")
        .select("user_id, shares, pending_withdraw")
        .eq("user_id", w.user_id)
        .maybeSingle();
      if (acctErr) throw acctErr;
      if (!acct) {
        results.push({ id: w.id, ok: false, reason: "account not found" });
        continue;
      }

      const currentShares = Number(acct.shares ?? 0);
      if (currentShares + 1e-12 < burnShares) {
        results.push({
          id: w.id,
          ok: false,
          reason: "insufficient shares",
          burnShares,
          currentShares,
        });
        continue;
      }

      // 3.2 更新 investor_accounts：burn shares
      const newShares = currentShares - burnShares;

      // pending_withdraw：扣掉 amount（避免一直累積）
      const currentPending = Number(acct.pending_withdraw ?? 0);
      const newPending = Math.max(0, currentPending - amount);

      const { error: updAccErr } = await supabase
        .from("investor_accounts")
        .update({
          shares: newShares,
          pending_withdraw: newPending,
          updated_at: nowIso,
        })
        .eq("user_id", w.user_id);
      if (updAccErr) throw updAccErr;

      // 3.3 更新提款狀態：UNPAID + executed_at
      const { error: updReqErr } = await supabase
        .from("investor_withdraw_requests")
        .update({
          status: "UNPAID",
          executed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", w.id);
      if (updReqErr) throw updReqErr;

      results.push({
        id: w.id,
        ok: true,
        user_id: w.user_id,
        amount,
        share_price_used: sharePrice,
        burn_shares: burnShares,
        new_shares: newShares,
        new_pending_withdraw: newPending,
      });
    }

    const executed = results.filter((r) => r.ok).length;

    return NextResponse.json({
      ok: true,
      nav_used: nav,
      nav_created_at: navCreatedAt,
      total_shares: totalShares,
      share_price_used: sharePrice,
      executed,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 401 });
  }
}

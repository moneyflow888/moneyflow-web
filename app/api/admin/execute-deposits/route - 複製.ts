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

async function getNavAndTotals(supabase: ReturnType<typeof supabaseAdmin>) {
  // latest NAV
  const { data: navRow, error: navErr } = await supabase
    .from("nav_snapshots")
    .select("total_nav, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (navErr) throw navErr;

  const nav = num(navRow?.total_nav ?? 0);
  const navCreatedAt = navRow?.created_at ?? null;

  // totals across all investors
  const { data: accounts, error: accErr } = await supabase
    .from("investor_accounts")
    .select("shares, principal");

  if (accErr) throw accErr;

  const totalShares = (accounts ?? []).reduce((acc, r: any) => acc + num(r.shares), 0);
  const totalPrincipal = (accounts ?? []).reduce((acc, r: any) => acc + num(r.principal), 0);

  const sharePrice = totalShares > 0 ? nav / totalShares : null;

  return { nav, navCreatedAt, totalShares, totalPrincipal, sharePrice };
}

export async function POST(_req: Request) {
  try {
    await requireAdminCookie();
    const supabase = supabaseAdmin();

    // 1) 當下 NAV / totals / share price
    const { nav, navCreatedAt, totalShares, totalPrincipal, sharePrice } = await getNavAndTotals(supabase);

    if (!navCreatedAt) {
      return NextResponse.json({ error: "nav_created_at missing" }, { status: 400 });
    }

    if (!sharePrice || !Number.isFinite(sharePrice) || sharePrice <= 0) {
      return NextResponse.json(
        { error: "share_price unavailable (total_shares=0?)" },
        { status: 400 }
      );
    }

    // 2) 取所有待結算入金（要包含 created_at 才能做半自動 gate）
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
        total_shares_before: totalShares,
        total_principal_before: totalPrincipal,
        share_price_used: sharePrice,
        executed: 0,
      });
    }

    const nowIso = new Date().toISOString();
    const navTs = new Date(navCreatedAt).getTime();

    // 3) 全體 principal 上限（含逐筆累加，避免同批多筆超過 NAV）
    //    允許極小誤差（浮點 / 匯率），你可調小或調大
    const EPS = 1e-6;

    let principalRunning = totalPrincipal; // 逐筆累加已結算入金
    const results: any[] = [];

    for (const d of pending) {
      const amount = num(d.amount);
      const depCreatedAt = d.created_at ?? null;
      const depTs = depCreatedAt ? new Date(depCreatedAt).getTime() : NaN;

      // --- 基本檢查
      if (!Number.isFinite(amount) || amount <= 0) {
        results.push({ id: d.id, ok: false, reason: "invalid amount" });
        continue;
      }

      // ✅ 半自動 gate：nav_created_at 必須 >= deposit_created_at
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

      // ✅ 全體限制：principal（含本筆）不得 > NAV
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

      // --- 允許結算：mint shares
      const mintedShares = amount / sharePrice;

      // 讀帳戶（帶 principal 才能連動）
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

      const currentShares = num(acct.shares);
      const currentPrincipal = num(acct.principal);

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

      // 2) 更新 investor_deposit_requests：MINTED + audit 欄位
      const { error: updReqErr } = await supabase
        .from("investor_deposit_requests")
        .update({
          status: "MINTED",
          executed_at: nowIso,
          share_price_used: sharePrice,
          minted_shares: mintedShares,
          updated_at: nowIso,
        })
        .eq("id", d.id);

      if (updReqErr) throw updReqErr;

      // 3) fund 層 principal_adjustments：讓 Dashboard 的 PnL Only 可以抵消入金
      const { error: insAdjErr } = await supabase.from("principal_adjustments").insert([
        {
          month: monthKeyNow(),
          delta: amount, // 入金正數
          note: `auto: deposit minted user=${d.user_id} deposit_id=${d.id}`,
          created_at: nowIso,
        },
      ]);

      if (insAdjErr) throw insAdjErr;

      // ✅ 這筆成功後，把 principalRunning 累加，避免同批下一筆超過 NAV
      principalRunning += amount;

      results.push({
        id: d.id,
        ok: true,
        user_id: d.user_id,
        amount,
        share_price_used: sharePrice,
        minted_shares: mintedShares,
        new_shares: newShares,
        new_principal: newPrincipal,
      });
    }

    const executed = results.filter((r) => r.ok).length;

    return NextResponse.json({
      ok: true,
      nav_used: nav,
      nav_created_at: navCreatedAt,
      total_shares_before: totalShares,
      total_principal_before: totalPrincipal,
      share_price_used: sharePrice,
      executed,
      results,
    });
  } catch (e: any) {
    const msg = e?.message ?? "error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

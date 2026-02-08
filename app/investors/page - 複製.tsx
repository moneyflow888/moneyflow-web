"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Shell, Card, THEME, Button } from "@/components/mf/MfUi";

/* =======================
   Types
======================= */
type InvestorAccount = {
  user_id: string;
  principal: number | null;
  shares: number | null;
  pending_withdraw: number | null;
  created_at: string;
  updated_at: string;
};

type InvestorProfile = {
  user_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
};

type WithdrawRequest = {
  id: number;
  user_id: string;
  amount: number | null;
  status: string | null;
  note: string | null;
  created_at: string;
};

type DepositRequest = {
  id: number;
  user_id: string;
  amount: number | null;
  status: string | null;
  note: string | null;
  created_at: string;
};

/* =======================
   Utils
======================= */
function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmt(v: any, d = 2) {
  return num(v).toLocaleString(undefined, { maximumFractionDigits: d });
}
function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
async function safeReadJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/* =======================
   Page
======================= */
export default function InvestorsPage() {
  // auth (login form)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // data
  const [profile, setProfile] = useState<InvestorProfile | null>(null);
  const [account, setAccount] = useState<InvestorAccount | null>(null);

  const [withdrawRequests, setWithdrawRequests] = useState<WithdrawRequest[]>([]);
  const [depositRequests, setDepositRequests] = useState<DepositRequest[]>([]);
  const [dataErr, setDataErr] = useState<string | null>(null);

  // share price (for value/pnl only)
  const [sharePrice, setSharePrice] = useState<number | null>(null);
  const [sharePriceUpdatedAt, setSharePriceUpdatedAt] = useState<string | null>(null);

  // withdraw form
  const [wdAmount, setWdAmount] = useState<string>("100");
  const [wdNote, setWdNote] = useState<string>("");
  const [wdSubmitting, setWdSubmitting] = useState(false);
  const [wdErr, setWdErr] = useState<string | null>(null);

  // deposit form
  const [dpAmount, setDpAmount] = useState<string>("1000");
  const [dpNote, setDpNote] = useState<string>("");
  const [dpSubmitting, setDpSubmitting] = useState(false);
  const [dpErr, setDpErr] = useState<string | null>(null);

  /* =======================
     Auth Init
  ======================= */
  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      setSessionEmail(data.session?.user?.email ?? null);
      setSessionUserId(data.session?.user?.id ?? null);
    });

    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, sess) => {
      setSessionEmail(sess?.user?.email ?? null);
      setSessionUserId(sess?.user?.id ?? null);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn() {
    try {
      setErr(null);
      setLoading(true);
      const { error } = await supabaseBrowser.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabaseBrowser.auth.signOut();
    setSessionEmail(null);
    setSessionUserId(null);
    setProfile(null);
    setAccount(null);
    setWithdrawRequests([]);
    setDepositRequests([]);
    setSharePrice(null);
    setSharePriceUpdatedAt(null);
  }

  /* =======================
     Load data
  ======================= */
  async function loadMyData() {
    setDataErr(null);

    const { data: sessOut, error: sessErr } = await supabaseBrowser.auth.getSession();
    if (sessErr) {
      setDataErr(sessErr.message);
      return;
    }
    const user = sessOut.session?.user;
    if (!user) return;

    const p = await supabaseBrowser
      .from("investor_profiles")
      .select("user_id,email,display_name,created_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (p.error) return setDataErr(p.error.message);
    setProfile(p.data as InvestorProfile);

    const a = await supabaseBrowser
      .from("investor_accounts")
      .select("user_id,principal,shares,pending_withdraw,created_at,updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (a.error) return setDataErr(a.error.message);
    setAccount(a.data as InvestorAccount);

    const wr = await supabaseBrowser
      .from("investor_withdraw_requests")
      .select("id,user_id,amount,status,note,created_at")
      .order("created_at", { ascending: false });
    if (wr.error) return setDataErr(wr.error.message);
    setWithdrawRequests((wr.data ?? []) as WithdrawRequest[]);

    const dr = await supabaseBrowser
      .from("investor_deposit_requests")
      .select("id,user_id,amount,status,note,created_at")
      .order("created_at", { ascending: false });
    if (dr.error) return setDataErr(dr.error.message);
    setDepositRequests((dr.data ?? []) as DepositRequest[]);

    // ✅ share price：拿不到就維持 null（PnL 顯示 —，不顯示任何錯誤字）
    try {
      const sp = await fetch("/api/admin/share-price", {
        credentials: "include",
        cache: "no-store",
      });

      if (!sp.ok) {
        setSharePrice(null);
        setSharePriceUpdatedAt(null);
        return;
      }

      const j = await safeReadJson(sp);
      const v = Number(j?.share_price);
      if (Number.isFinite(v) && v > 0) {
        setSharePrice(v);
        setSharePriceUpdatedAt(j?.nav_created_at ?? null);
      } else {
        setSharePrice(null);
        setSharePriceUpdatedAt(null);
      }
    } catch {
      setSharePrice(null);
      setSharePriceUpdatedAt(null);
    }
  }

  useEffect(() => {
    if (!sessionEmail) return;
    loadMyData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionEmail]);

  /* =======================
     Derived (你要的邏輯)
  ======================= */
  const principal = num(account?.principal);
  const shares = num(account?.shares);

  const value = sharePrice !== null ? shares * sharePrice : null;
  const pnl = value !== null ? value - principal : null;
  const pnlPct = pnl !== null && principal > 0 ? (pnl / principal) * 100 : null;

  const displayName = useMemo(() => {
    if (profile?.display_name) return profile.display_name;
    if (sessionEmail) return sessionEmail.split("@")[0];
    return "Investor";
  }, [profile?.display_name, sessionEmail]);

  /* =======================
     Withdraw actions
  ======================= */
  async function submitWithdraw() {
    try {
      setWdErr(null);
      setWdSubmitting(true);

      const amount = Number(wdAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("提款金額必須是大於 0 的數字");

      const ins = await supabaseBrowser
        .from("investor_withdraw_requests")
        .insert({
          user_id: sessionUserId!,
          amount,
          status: "PENDING",
          note: wdNote.trim() || null,
        })
        .select("id,user_id,amount,status,note,created_at")
        .single();

      if (ins.error) throw ins.error;

      setWdNote("");
      await loadMyData();
    } catch (e: any) {
      setWdErr(e?.message || String(e));
    } finally {
      setWdSubmitting(false);
    }
  }

  async function cancelWithdraw(id: number) {
    try {
      const target = withdrawRequests.find((x) => x.id === id);
      if (!target) return;
      if ((target.status ?? "").toUpperCase() !== "PENDING") return;

      const up = await supabaseBrowser
        .from("investor_withdraw_requests")
        .update({ status: "CANCELLED" })
        .eq("id", id)
        .select("id,user_id,amount,status,note,created_at")
        .single();

      if (up.error) throw up.error;

      await loadMyData();
    } catch (e: any) {
      setWdErr(e?.message || String(e));
    }
  }

  /* =======================
     Deposit actions
  ======================= */
  async function submitDeposit() {
    try {
      setDpErr(null);
      setDpSubmitting(true);

      const amount = Number(dpAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("入金金額必須是大於 0 的數字");

      const ins = await supabaseBrowser
        .from("investor_deposit_requests")
        .insert({
          user_id: sessionUserId!,
          amount,
          status: "PENDING",
          note: dpNote.trim() || null,
        })
        .select("id,user_id,amount,status,note,created_at")
        .single();

      if (ins.error) throw ins.error;

      setDpNote("");
      await loadMyData();
    } catch (e: any) {
      setDpErr(e?.message || String(e));
    } finally {
      setDpSubmitting(false);
    }
  }

  async function cancelDeposit(id: number) {
    try {
      const target = depositRequests.find((x) => x.id === id);
      if (!target) return;
      if ((target.status ?? "").toUpperCase() !== "PENDING") return;

      const up = await supabaseBrowser
        .from("investor_deposit_requests")
        .update({ status: "CANCELLED" })
        .eq("id", id)
        .select("id,user_id,amount,status,note,created_at")
        .single();

      if (up.error) throw up.error;

      await loadMyData();
    } catch (e: any) {
      setDpErr(e?.message || String(e));
    }
  }

  /* =======================
     Table styles (scroll)
  ======================= */
  const tableWrapStyle: React.CSSProperties = {
    borderColor: "rgba(255,255,255,0.10)",
    maxHeight: 420,
    overflowY: "auto",
    overflowX: "hidden",
  };

  const theadStickyStyle: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 1,
    background: "rgba(15,15,15,0.92)",
    color: THEME.muted,
    backdropFilter: "blur(8px)",
  };

  /* =======================
     Render
  ======================= */
  return (
    <Shell>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Investor Portal</h1>
          <div className="mt-2 text-sm" style={{ color: THEME.muted }}>
            MVP：先做真登入（Email/Password），登入後顯示你的帳戶與提款/入金申請（RLS）。
          </div>
          {sessionEmail ? (
            <div className="mt-2 text-sm" style={{ color: THEME.muted }}>
              已登入： <span style={{ color: THEME.text }}>{sessionEmail}</span>
            </div>
          ) : null}
        </div>

        {/* 右上角按鈕 */}
        <div className="flex flex-wrap justify-end gap-2">
          <Link href="/">
            <Button>回到 Dashboard</Button>
          </Link>

          {sessionEmail ? (
            <>
              <Button onClick={loadMyData}>重新載入</Button>
              <Button onClick={signOut}>登出</Button>
            </>
          ) : null}
        </div>
      </div>

      {/* Logged out */}
      {!sessionEmail ? (
        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="登入" subtitle="使用 Supabase Auth（Email/Password）" accent="gold">
            <div className="mt-2 space-y-4">
              <div>
                <div className="mb-1 text-xs" style={{ color: THEME.muted }}>
                  Email
                </div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{
                    borderColor: THEME.border,
                    background: "rgba(255,255,255,0.03)",
                    color: THEME.text,
                  }}
                />
              </div>

              <div>
                <div className="mb-1 text-xs" style={{ color: THEME.muted }}>
                  Password
                </div>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{
                    borderColor: THEME.border,
                    background: "rgba(255,255,255,0.03)",
                    color: THEME.text,
                  }}
                />
              </div>

              <Button variant="solid" onClick={signIn} disabled={loading} className="w-full">
                {loading ? "登入中…" : "登入"}
              </Button>

              {err ? <div className="text-sm text-red-400 whitespace-pre-line">{err}</div> : null}

              <div className="text-xs" style={{ color: THEME.faint }}>
                你在 Supabase Auth 新增使用者後，trigger 會自動建立 investor_profiles / investor_accounts。
              </div>
            </div>
          </Card>

          <Card title="提款/入金規則" accent="navy">
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm" style={{ color: THEME.muted }}>
              <li>入金：投資人送出 PENDING → 管理者 Execute Deposits 後變 MINTED（並鑄造 shares）</li>
              <li>提款：投資人送出 PENDING → 管理者 Execute Withdrawals 後變 UNPAID（燒 shares）</li>
              <li>你轉帳後再標記 PAID（之後可做）</li>
            </ol>
          </Card>
        </div>
      ) : (
        /* Logged in */
        <div className="mt-10 space-y-4">
          <Card
            accent="gold"
            title={`登入成功 ✅ (${displayName})`}
            subtitle="下面資料皆走 RLS（只能看到你自己的 investor_accounts / deposit_requests / withdraw_requests）。"
            right={
              <div className="text-xs text-right" style={{ color: THEME.faint }}>
                user_id
                <div className="mt-1 font-mono" style={{ color: THEME.muted }}>
                  {sessionUserId ?? "—"}
                </div>
              </div>
            }
          >
            {dataErr ? <div className="text-sm text-red-400 whitespace-pre-line">{dataErr}</div> : null}
          </Card>

          {/* KPI */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card accent="gold" title="淨入金（principal）" subtitle="（入金累積 - 出金累積）">
              <div className="mt-2 text-3xl font-semibold">
                {fmt(principal)}{" "}
                <span className="text-lg" style={{ color: THEME.muted }}>
                  U
                </span>
              </div>
            </Card>

            <Card accent="neutral" title="待提款（PENDING）" subtitle="（你目前已提交但尚未結算）">
              <div className="mt-2 text-3xl font-semibold">
                {fmt(account?.pending_withdraw)}{" "}
                <span className="text-lg" style={{ color: THEME.muted }}>
                  U
                </span>
              </div>
            </Card>

            <Card
              accent={pnl !== null && pnl >= 0 ? "gold" : "navy"}
              title="目前損益 (PnL)"
              // ✅ 拿不到 share_price 就完全不要顯示「估值」
              subtitle={value !== null && sharePriceUpdatedAt ? `更新：${fmtTime(sharePriceUpdatedAt)}` : "—"}
            >
              <div
                className="mt-2 text-3xl font-semibold"
                style={{ color: pnl !== null && pnl < 0 ? "#ef4444" : "#22c55e" }}
              >
                {pnl === null ? (
                  "—"
                ) : (
                  <>
                    {pnl >= 0 ? "+" : ""}
                    {fmt(pnl)} U{" "}
                    <span style={{ color: THEME.muted, fontSize: 16 }}>
                      ({principal > 0 ? `${fmt(pnlPct)}%` : "—"})
                    </span>
                  </>
                )}
              </div>
            </Card>
          </div>

          {/* 提款 + 入金 */}
          <Card
            accent="gold"
            title="提款 / 入金 申請（輸入 U 金額）"
            subtitle={
              <div className="text-sm" style={{ color: THEME.muted }}>
                <div>
                  提款 →{" "}
                  <span className="font-mono" style={{ color: THEME.text }}>
                    investor_withdraw_requests
                  </span>{" "}
                  會新增{" "}
                  <span className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: THEME.border }}>
                    PENDING
                  </span>
                </div>
                <div className="mt-1">
                  入金 →{" "}
                  <span className="font-mono" style={{ color: THEME.text }}>
                    investor_deposit_requests
                  </span>{" "}
                  會新增{" "}
                  <span className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: THEME.border }}>
                    PENDING
                  </span>
                </div>
              </div>
            }
          >
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Withdraw column */}
              <div className="rounded-2xl border p-4" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
                <div className="text-sm font-semibold" style={{ color: THEME.text }}>
                  提款申請
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div>
                    <div className="mb-1 text-xs" style={{ color: THEME.muted }}>
                      提款金額（U）
                    </div>
                    <input
                      value={wdAmount}
                      onChange={(e) => setWdAmount(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                      style={{
                        borderColor: THEME.border,
                        background: "rgba(255,255,255,0.03)",
                        color: THEME.text,
                      }}
                    />
                  </div>

                  <div>
                    <div className="mb-1 text-xs" style={{ color: THEME.muted }}>
                      備註（可空）
                    </div>
                    <input
                      value={wdNote}
                      onChange={(e) => setWdNote(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                      style={{
                        borderColor: THEME.border,
                        background: "rgba(255,255,255,0.03)",
                        color: THEME.text,
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button variant="solid" onClick={submitWithdraw} disabled={wdSubmitting}>
                    {wdSubmitting ? "送出中…" : "提交提款"}
                  </Button>
                  {wdErr ? <div className="text-sm text-red-400 whitespace-pre-line">{wdErr}</div> : null}
                </div>
              </div>

              {/* Deposit column */}
              <div className="rounded-2xl border p-4" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
                <div className="text-sm font-semibold" style={{ color: THEME.text }}>
                  入金申請
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div>
                    <div className="mb-1 text-xs" style={{ color: THEME.muted }}>
                      入金金額（U）
                    </div>
                    <input
                      value={dpAmount}
                      onChange={(e) => setDpAmount(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                      style={{
                        borderColor: THEME.border,
                        background: "rgba(255,255,255,0.03)",
                        color: THEME.text,
                      }}
                    />
                  </div>

                  <div>
                    <div className="mb-1 text-xs" style={{ color: THEME.muted }}>
                      備註（可空）
                    </div>
                    <input
                      value={dpNote}
                      onChange={(e) => setDpNote(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                      style={{
                        borderColor: THEME.border,
                        background: "rgba(255,255,255,0.03)",
                        color: THEME.text,
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button variant="solid" onClick={submitDeposit} disabled={dpSubmitting}>
                    {dpSubmitting ? "送出中…" : "提交入金"}
                  </Button>
                  {dpErr ? <div className="text-sm text-red-400 whitespace-pre-line">{dpErr}</div> : null}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={loadMyData}>重新整理列表</Button>
            </div>
          </Card>

          {/* Lists */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Withdraw list */}
            <Card accent="navy" title="提款申請" subtitle="只會看到你自己的資料（RLS）。">
              <div className="mt-3 rounded-xl border" style={tableWrapStyle}>
                <table className="w-full text-sm">
                  <thead style={theadStickyStyle}>
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">時間</th>
                      <th className="px-4 py-3 text-right font-medium">金額(U)</th>
                      <th className="px-4 py-3 text-left font-medium">狀態</th>
                      <th className="px-4 py-3 text-left font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }}>
                    {withdrawRequests.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4" style={{ color: THEME.muted }} colSpan={4}>
                          尚無提款申請
                        </td>
                      </tr>
                    ) : (
                      withdrawRequests.map((r) => {
                        const st = (r.status ?? "").toUpperCase();
                        const canCancel = st === "PENDING";
                        return (
                          <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                            <td className="px-4 py-3" style={{ color: THEME.muted }}>
                              {fmtTime(r.created_at)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums" style={{ color: THEME.text }}>
                              {fmt(r.amount)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="rounded-full border px-2 py-0.5 text-xs"
                                style={{
                                  borderColor: THEME.border,
                                  background: "rgba(255,255,255,0.04)",
                                  color: THEME.text,
                                }}
                              >
                                {st || "—"}
                              </span>
                              {r.note ? (
                                <div className="mt-1 text-xs" style={{ color: THEME.faint }}>
                                  {r.note}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">
                              {canCancel ? (
                                <button
                                  onClick={() => cancelWithdraw(r.id)}
                                  className="rounded-lg border px-3 py-1.5 text-xs transition"
                                  style={{
                                    borderColor: "rgba(255,255,255,0.12)",
                                    background: "rgba(255,255,255,0.05)",
                                    color: THEME.text,
                                  }}
                                >
                                  取消
                                </button>
                              ) : (
                                <span className="text-xs" style={{ color: THEME.faint }}>
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Deposit list */}
            <Card accent="gold" title="入金申請" subtitle="只會看到你自己的資料（RLS）。">
              <div className="mt-3 rounded-xl border" style={tableWrapStyle}>
                <table className="w-full text-sm">
                  <thead style={theadStickyStyle}>
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">時間</th>
                      <th className="px-4 py-3 text-right font-medium">金額(U)</th>
                      <th className="px-4 py-3 text-left font-medium">狀態</th>
                      <th className="px-4 py-3 text-left font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }}>
                    {depositRequests.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4" style={{ color: THEME.muted }} colSpan={4}>
                          尚無入金申請
                        </td>
                      </tr>
                    ) : (
                      depositRequests.map((r) => {
                        const st = (r.status ?? "").toUpperCase();
                        const canCancel = st === "PENDING";
                        return (
                          <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                            <td className="px-4 py-3" style={{ color: THEME.muted }}>
                              {fmtTime(r.created_at)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums" style={{ color: THEME.text }}>
                              {fmt(r.amount)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className="rounded-full border px-2 py-0.5 text-xs"
                                style={{
                                  borderColor: THEME.border,
                                  background: "rgba(255,255,255,0.04)",
                                  color: THEME.text,
                                }}
                              >
                                {st || "—"}
                              </span>
                              {r.note ? (
                                <div className="mt-1 text-xs" style={{ color: THEME.faint }}>
                                  {r.note}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3">
                              {canCancel ? (
                                <button
                                  onClick={() => cancelDeposit(r.id)}
                                  className="rounded-lg border px-3 py-1.5 text-xs transition"
                                  style={{
                                    borderColor: "rgba(255,255,255,0.12)",
                                    background: "rgba(255,255,255,0.05)",
                                    color: THEME.text,
                                  }}
                                >
                                  取消
                                </button>
                              ) : (
                                <span className="text-xs" style={{ color: THEME.faint }}>
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 text-xs" style={{ color: THEME.faint }}>
                入金申請送出後會是 PENDING；等你在首頁 Admin 按「Execute Deposits」才會變 MINTED，並更新 principal / shares。
              </div>
            </Card>
          </div>

          {/* Profile */}
          <Card accent="gold" title="你的 profile" subtitle="來自 investor_profiles（RLS）。">
            <div
              className="mt-3 rounded-xl border p-4 text-sm"
              style={{
                borderColor: "rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.18)",
                color: THEME.muted,
              }}
            >
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-xs" style={{ color: THEME.faint }}>
                    user_id
                  </div>
                  <div className="mt-1 font-mono" style={{ color: THEME.text }}>
                    {profile?.user_id ?? sessionUserId ?? "—"}
                  </div>
                </div>

                <div>
                  <div className="text-xs" style={{ color: THEME.faint }}>
                    email
                  </div>
                  <div className="mt-1" style={{ color: THEME.text }}>
                    {profile?.email ?? sessionEmail ?? "—"}
                  </div>
                </div>

                <div>
                  <div className="text-xs" style={{ color: THEME.faint }}>
                    display_name
                  </div>
                  <div className="mt-1" style={{ color: THEME.text }}>
                    {profile?.display_name ?? "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 text-xs" style={{ color: THEME.faint }}>
              下一步我們會做：入金/提款都走 forward pricing（同一個 share_price），由 Admin 統一 Execute。
            </div>
          </Card>
        </div>
      )}
    </Shell>
  );
}

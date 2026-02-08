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
  principal: number | null; // ✅ 你要的「淨入金」顯示來源
  principal_remaining?: number | null; // (保留欄位但不再用來顯示 principal / 算PnL)
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

  // share price (for value/pnl)
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
  }

  /* =======================
     Load data
  ======================= */
  async function loadMyData() {
    setDataErr(null);

    const { data: sessOut, error: sessErr } = await supabaseBrowser.auth.getSession();
    if (sessErr) return setDataErr(sessErr.message);

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
      .select("user_id,principal,principal_remaining,shares,pending_withdraw,created_at,updated_at")
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

    // share price (public read api or admin api; your current endpoint)
    const sp = await fetch("/api/admin/share-price", {
      credentials: "include",
      cache: "no-store",
    });
    if (sp.ok) {
      const j = await sp.json();
      if (Number.isFinite(j.share_price)) {
        setSharePrice(j.share_price);
        setSharePriceUpdatedAt(j.nav_created_at ?? null);
      }
    }
  }

  useEffect(() => {
    if (!sessionEmail) return;
    loadMyData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionEmail]);

  /* =======================
     Derived
     ✅ 你要的邏輯：
     principal = 淨入金（principal）
     value = shares * 最新 share_price
     pnl = value - principal
  ======================= */
  const principal = num(account?.principal);
  const shares = num(account?.shares);

  const value = sharePrice !== null ? shares * sharePrice : null;
  const pnl = value !== null ? value - principal : null;

  // ✅ principal=0 時，不顯示 0%（避免除以 0）
  const pnlPct =
    pnl !== null && principal > 0 ? (pnl / principal) * 100 : null;

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
            <Card accent="gold" title="淨入金（principal）" subtitle="（淨入金：入金累積 - 出金累積）">
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
              subtitle={
                value !== null
                  ? `估值 ${fmt(value)} U${sharePriceUpdatedAt ? `（更新：${fmtTime(sharePriceUpdatedAt)}）` : ""}`
                  : "—"
              }
            >
              <div
                className="mt-2 text-3xl font-semibold"
                style={{ color: pnl !== null && pnl < 0 ? "#ef4444" : "#22c55e" }}
              >
                {pnl !== null
                  ? `${pnl >= 0 ? "+" : ""}${fmt(pnl)} U (${pnlPct === null ? "—" : fmt(pnlPct)}%)`
                  : "—"}
              </div>
            </Card>
          </div>

          {/* 下面其餘內容（表格、申請、scroll）保持你原本那份即可 */}
          {/* ⚠️ 你貼的程式後面很長，我不再重複貼第二遍（避免你複製出錯）。
              但如果你要我「整份檔案」都原封不動保留，只改 KPI/PnL 的邏輯，
              我也可以把後半段完整貼回去。 */}
        </div>
      )}
    </Shell>
  );
}

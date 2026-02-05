"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

/**
 * (GOLD) 金融金色主題（跟首頁一致）
 */
const THEME = {
  bg: "#07090D",
  bg2: "#0B0E14",
  card: "rgba(255,255,255,0.04)",
  card2: "rgba(255,255,255,0.06)",
  border: "rgba(226, 198, 128, 0.18)",
  borderSoft: "rgba(148,163,184,0.16)",
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.62)",
  faint: "rgba(255,255,255,0.42)",
  gold: "#D4AF37",
  gold2: "#F2D27D",
  gold3: "#B68A2A",
  navy: "#1D4ED8",
  navy2: "#60A5FA",
  good: "#22c55e",
  bad: "#ef4444",
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(v: any) {
  return num(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatTime(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function Card({
  title,
  subtitle,
  right,
  children,
  className,
  accent = "gold",
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  accent?: "gold" | "navy" | "good" | "bad" | "neutral";
}) {
  const accentColor =
    accent === "good"
      ? THEME.good
      : accent === "bad"
      ? THEME.bad
      : accent === "navy"
      ? THEME.navy2
      : accent === "neutral"
      ? "rgba(148,163,184,0.55)"
      : THEME.gold;

  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-2xl border backdrop-blur-xl",
        "transition-transform transition-shadow hover:-translate-y-0.5",
        "hover:shadow-[0_18px_60px_rgba(0,0,0,0.55)]",
        className
      )}
      style={{
        borderColor: THEME.border,
        background: `linear-gradient(180deg, ${THEME.card2} 0%, ${THEME.card} 100%)`,
        boxShadow: "0 0 0 1px rgba(226,198,128,0.06) inset",
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, ${accentColor} 0%, rgba(226,198,128,0) 72%)`,
          opacity: 0.95,
        }}
      />
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full blur-3xl"
        style={{ background: "rgba(212,175,55,0.12)" }}
      />

      {(title || subtitle || right) && (
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            {title && (
              <div className="text-sm font-semibold" style={{ color: THEME.text }}>
                {title}
              </div>
            )}
            {subtitle && (
              <div className="mt-1 text-xs" style={{ color: THEME.muted }}>
                {subtitle}
              </div>
            )}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      )}

      <div className={clsx(title || subtitle || right ? "px-6 pb-6 pt-4" : "p-6")}>{children}</div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const toneColor = tone === "good" ? THEME.good : tone === "bad" ? THEME.bad : THEME.text;
  const dotColor = tone === "good" ? THEME.good : tone === "bad" ? THEME.bad : THEME.gold;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm" style={{ color: THEME.muted }}>
        <span
          className="h-2 w-2 rounded-full"
          style={{
            background: dotColor,
            boxShadow:
              tone === "good"
                ? "0 0 14px rgba(34,197,94,0.35)"
                : tone === "bad"
                ? "0 0 14px rgba(239,68,68,0.35)"
                : "0 0 14px rgba(212,175,55,0.35)",
          }}
        />
        <span>{label}</span>
      </div>

      <div className="mt-2 text-3xl font-semibold tracking-tight" style={{ color: toneColor }}>
        {value}
      </div>

      {sub ? (
        <div className="mt-1 text-xs whitespace-pre-line" style={{ color: THEME.muted }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Types
 */
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
  updated_at?: string | null;
  executed_at?: string | null;
  executed_nav?: number | null;
  share_price?: number | null;
  shares_to_redeem?: number | null;
};

function badgeStyle(status: string) {
  const s = (status || "").toUpperCase();
  const isPending = s === "PENDING";
  const isUnpaid = s === "UNPAID";
  const isPaid = s === "PAID";
  const isCancelled = s === "CANCELLED" || s === "CANCELED";

  const border = isPending
    ? "rgba(242,210,125,0.35)"
    : isUnpaid
    ? "rgba(96,165,250,0.35)"
    : isPaid
    ? "rgba(34,197,94,0.35)"
    : isCancelled
    ? "rgba(239,68,68,0.35)"
    : "rgba(148,163,184,0.25)";

  const bg = isPending
    ? "rgba(212,175,55,0.10)"
    : isUnpaid
    ? "rgba(29,78,216,0.10)"
    : isPaid
    ? "rgba(34,197,94,0.10)"
    : isCancelled
    ? "rgba(239,68,68,0.10)"
    : "rgba(255,255,255,0.06)";

  const color = isPending
    ? THEME.gold2
    : isUnpaid
    ? "rgba(147,197,253,0.95)"
    : isPaid
    ? "rgba(134,239,172,0.95)"
    : isCancelled
    ? "rgba(252,165,165,0.95)"
    : THEME.muted;

  return { border, bg, color };
}

export default function InvestorsPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loadingAuth, setLoadingAuth] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [profile, setProfile] = useState<InvestorProfile | null>(null);
  const [account, setAccount] = useState<InvestorAccount | null>(null);
  const [withdraws, setWithdraws] = useState<WithdrawRequest[]>([]);
  const [dataErr, setDataErr] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  // withdraw form
  const [wAmount, setWAmount] = useState<number>(100);
  const [wNote, setWNote] = useState<string>("");

  const pendingTotalFromList = useMemo(() => {
    return withdraws
      .filter((x) => String(x.status || "").toUpperCase() === "PENDING")
      .reduce((acc, x) => acc + num(x.amount), 0);
  }, [withdraws]);

  const pendingDisplay = account?.pending_withdraw ?? pendingTotalFromList;

  // 讀登入狀態 + 訂閱變更
  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!mounted) return;
      const u = data.session?.user;
      setSessionEmail(u?.email ?? null);
      setUserId(u?.id ?? null);
    }

    init();

    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_event, sess) => {
      const u = sess?.user;
      setSessionEmail(u?.email ?? null);
      setUserId(u?.id ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function loadMyData() {
    setDataErr(null);
    setProfile(null);
    setAccount(null);
    setWithdraws([]);

    const { data: sessOut, error: sessErr } = await supabaseBrowser.auth.getSession();
    if (sessErr) {
      setDataErr(sessErr.message);
      return;
    }
    const user = sessOut.session?.user;
    if (!user) return;

    try {
      setReloading(true);

      // 1) profile
      const p = await supabaseBrowser
        .from("investor_profiles")
        .select("user_id,email,display_name,created_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (p.error) throw new Error(`讀取 investor_profiles 失敗：${p.error.message}`);
      if (p.data) setProfile(p.data as InvestorProfile);

      // 2) account
      const a = await supabaseBrowser
        .from("investor_accounts")
        .select("user_id,principal,shares,pending_withdraw,created_at,updated_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (a.error) throw new Error(`讀取 investor_accounts 失敗：${a.error.message}`);
      if (a.data) setAccount(a.data as InvestorAccount);

      // 3) withdraw requests
      const w = await supabaseBrowser
        .from("investor_withdraw_requests")
        .select(
          "id,user_id,amount,status,note,created_at,updated_at,executed_at,executed_nav,share_price,shares_to_redeem"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (w.error) throw new Error(`讀取 investor_withdraw_requests 失敗：${w.error.message}`);
      setWithdraws((w.data ?? []) as WithdrawRequest[]);
    } catch (e: any) {
      setDataErr(e?.message || String(e));
    } finally {
      setReloading(false);
    }
  }

  // 登入後自動載入資料
  useEffect(() => {
    if (!sessionEmail) return;
    loadMyData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionEmail]);

  async function signIn() {
    try {
      setErr(null);
      setLoadingAuth(true);

      const { data, error } = await supabaseBrowser.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      setSessionEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoadingAuth(false);
    }
  }

  async function signOut() {
    await supabaseBrowser.auth.signOut();
    setSessionEmail(null);
    setUserId(null);
    setProfile(null);
    setAccount(null);
    setWithdraws([]);
  }

  async function submitWithdraw() {
    try {
      setDataErr(null);
      const amt = Number(wAmount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("提款金額需為正數");

      const { data: sessOut, error: sessErr } = await supabaseBrowser.auth.getSession();
      if (sessErr) throw sessErr;
      const user = sessOut.session?.user;
      if (!user) throw new Error("尚未登入");

      // 插入一筆 PENDING（user_id 用 RLS 保護）
      const note = wNote?.trim() ? wNote.trim() : `from_ui_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}_${String(Date.now()).slice(-4)}`;

      const ins = await supabaseBrowser
        .from("investor_withdraw_requests")
        .insert([
          {
            user_id: user.id,
            amount: amt,
            status: "PENDING",
            note,
          },
        ])
        .select("id")
        .maybeSingle();

      if (ins.error) throw new Error(`送出提款申請失敗：${ins.error.message}`);

      setWAmount(100);
      setWNote("");
      await loadMyData();
    } catch (e: any) {
      setDataErr(e?.message || String(e));
    }
  }

  async function cancelWithdraw(id: number) {
    try {
      setDataErr(null);
      const { data: sessOut, error: sessErr } = await supabaseBrowser.auth.getSession();
      if (sessErr) throw sessErr;
      const user = sessOut.session?.user;
      if (!user) throw new Error("尚未登入");

      // 只允許取消自己的 PENDING
      const upd = await supabaseBrowser
        .from("investor_withdraw_requests")
        .update({ status: "CANCELLED" })
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("status", "PENDING")
        .select("id")
        .maybeSingle();

      if (upd.error) throw new Error(`取消失敗：${upd.error.message}`);
      await loadMyData();
    } catch (e: any) {
      setDataErr(e?.message || String(e));
    }
  }

  const tags = ["investor", "RLS"];

  return (
    <div className="min-h-screen" style={{ background: THEME.bg, color: THEME.text }}>
      {/* 背景（跟首頁一致） */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -top-44 -left-44 h-[560px] w-[560px] rounded-full blur-3xl"
          style={{ background: "rgba(212,175,55,0.16)" }}
        />
        <div
          className="absolute top-10 -right-48 h-[620px] w-[620px] rounded-full blur-3xl"
          style={{ background: "rgba(29,78,216,0.10)" }}
        />
        <div
          className="absolute bottom-0 left-1/4 h-[680px] w-[680px] rounded-full blur-3xl"
          style={{ background: "rgba(242,210,125,0.06)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(1200px 700px at 50% 30%, rgba(255,255,255,0.06), rgba(0,0,0,0.0) 55%), radial-gradient(900px 700px at 50% 110%, rgba(0,0,0,0.55), rgba(0,0,0,0.92))",
            opacity: 0.9,
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-10">
        {/* Header（對齊首頁語氣） */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <Image src="/logo.png" alt="MoneyFlow" width={120} height={120} className="rounded-xl" />
            </div>

            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Investor Portal
                <span className="ml-3 align-middle text-xs font-semibold" style={{ color: THEME.muted }}>
                  Private (RLS)
                </span>
              </h1>
              <div className="mt-2 text-sm" style={{ color: THEME.muted }}>
                {sessionEmail ? (
                  <>
                    已登入：{" "}
                    <span className="font-medium" style={{ color: THEME.text }}>
                      {sessionEmail}
                    </span>
                  </>
                ) : (
                  <>請先登入（Email / Password）</>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="rounded-full border px-3 py-1 text-xs font-semibold transition"
              style={{
                borderColor: "rgba(255,255,255,0.25)",
                color: "rgba(255,255,255,0.95)",
                background: "rgba(255,255,255,0.10)",
              }}
            >
              回到 Dashboard
            </Link>

            {sessionEmail ? (
              <>
                <button
                  onClick={loadMyData}
                  className="rounded-full border px-3 py-1 text-xs font-semibold transition"
                  style={{
                    borderColor: "rgba(226,198,128,0.35)",
                    color: THEME.gold2,
                    background: "rgba(212,175,55,0.10)",
                    opacity: reloading ? 0.7 : 1,
                  }}
                >
                  {reloading ? "載入中…" : "重新載入"}
                </button>

                <button
                  onClick={signOut}
                  className="rounded-full border px-3 py-1 text-xs font-semibold transition"
                  style={{
                    borderColor: "rgba(239,68,68,0.35)",
                    color: "rgba(252,165,165,0.95)",
                    background: "rgba(239,68,68,0.10)",
                  }}
                >
                  登出
                </button>
              </>
            ) : null}

            {tags.map((t, i) => (
              <span
                key={t}
                className="rounded-full border px-3 py-1 text-xs font-semibold"
                style={{
                  borderColor: i === 0 ? "rgba(226,198,128,0.35)" : "rgba(29,78,216,0.30)",
                  color: i === 0 ? THEME.gold2 : "rgba(147,197,253,0.95)",
                  background: i === 0 ? "rgba(212,175,55,0.10)" : "rgba(29,78,216,0.10)",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* 未登入：登入卡 */}
        {!sessionEmail ? (
          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card accent="gold" title="登入" subtitle="使用 Supabase Auth（Email/Password）">
              <div className="space-y-4">
                <div>
                  <div className="mb-1 text-xs" style={{ color: THEME.muted }}>
                    Email
                  </div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    style={{
                      borderColor: "rgba(226,198,128,0.18)",
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
                      borderColor: "rgba(226,198,128,0.18)",
                      background: "rgba(255,255,255,0.03)",
                      color: THEME.text,
                    }}
                  />
                </div>

                <button
                  onClick={signIn}
                  disabled={loadingAuth}
                  className="w-full rounded-xl px-3 py-2 text-sm font-semibold transition-opacity"
                  style={{
                    background: THEME.gold2,
                    color: "#0B0E14",
                    opacity: loadingAuth ? 0.7 : 1,
                  }}
                >
                  {loadingAuth ? "登入中…" : "登入"}
                </button>

                {err ? (
                  <div className="text-sm whitespace-pre-line" style={{ color: THEME.bad }}>
                    {err}
                  </div>
                ) : null}

                <div className="text-xs" style={{ color: THEME.muted }}>
                  提醒：你在 Supabase Auth 新增使用者後，trigger 會自動建立 investor_accounts / investor_profiles。
                </div>
              </div>
            </Card>

            <Card
              accent="navy"
              title="提款規則（MVP）"
              subtitle="前端送出 → PENDING；快照成交 → UNPAID；你出金後 → PAID"
            >
              <ol className="mt-1 list-decimal space-y-2 pl-5 text-sm" style={{ color: THEME.muted }}>
                <li>投資人輸入提款 U 金額 → 產生 PENDING</li>
                <li>下一次快照時自動成交（forward pricing）→ UNPAID</li>
                <li>你手動轉帳後（Admin）標記 PAID</li>
                <li>投資人只看得到自己的資料（RLS）</li>
              </ol>
            </Card>
          </div>
        ) : (
          <>
            {/* 登入狀態卡 */}
            <div className="mt-8">
              <Card
                accent="gold"
                title="登入成功 ✅"
                subtitle="下面資料皆走 RLS（只會看到你自己的 investor_accounts / withdraw_requests）"
                right={
                  <div className="text-xs text-right" style={{ color: THEME.muted }}>
                    user_id
                    <div className="mt-1 font-semibold" style={{ color: THEME.text }}>
                      {userId ?? "—"}
                    </div>
                  </div>
                }
              >
                {dataErr ? (
                  <div className="text-sm whitespace-pre-line" style={{ color: THEME.bad }}>
                    {dataErr}
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: THEME.muted }}>
                    最後更新：{formatTime(new Date().toISOString())}
                  </div>
                )}
              </Card>
            </div>

            {/* KPI */}
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card accent="gold">
                <Metric label="淨入金（principal）" value={`${fmt(account?.principal)} U`} sub="由入金/出金流程更新" />
              </Card>

              <Card accent="navy">
                <Metric label="持有 shares" value={`${fmt(account?.shares)}`} sub="下一步接 share price / NAV" />
              </Card>

              <Card accent="good">
                <Metric label="待提款（pending_withdraw）" value={`${fmt(pendingDisplay)} U`} sub="PENDING 會先累加在這裡" />
              </Card>
            </div>

            {/* 提款申請（輸入） */}
            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card
                className="lg:col-span-2"
                accent="gold"
                title="提款申請（輸入 U 金額）"
                subtitle="送出後會在 investor_withdraw_requests 新增一筆 PENDING"
                right={
                  <button
                    onClick={loadMyData}
                    className="rounded-full border px-3 py-1 text-xs font-semibold transition"
                    style={{
                      borderColor: "rgba(226,198,128,0.35)",
                      color: THEME.gold2,
                      background: "rgba(212,175,55,0.10)",
                      opacity: reloading ? 0.7 : 1,
                    }}
                  >
                    {reloading ? "整理中…" : "重新整理列表"}
                  </button>
                }
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs" style={{ color: THEME.muted }}>
                      提款金額（U）
                    </div>
                    <input
                      value={wAmount}
                      onChange={(e) => setWAmount(Number(e.target.value))}
                      type="number"
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                      style={{
                        borderColor: "rgba(226,198,128,0.18)",
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
                      value={wNote}
                      onChange={(e) => setWNote(e.target.value)}
                      placeholder="例如：本月提領"
                      className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                      style={{
                        borderColor: "rgba(226,198,128,0.18)",
                        background: "rgba(255,255,255,0.03)",
                        color: THEME.text,
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={submitWithdraw}
                    className="rounded-xl px-4 py-2 text-sm font-semibold transition-opacity"
                    style={{ background: THEME.gold2, color: "#0B0E14" }}
                  >
                    提交申請
                  </button>

                  <button
                    onClick={() => {
                      setWAmount(100);
                      setWNote("");
                    }}
                    className="rounded-xl border px-4 py-2 text-sm font-semibold"
                    style={{
                      borderColor: "rgba(226,198,128,0.18)",
                      background: "rgba(255,255,255,0.03)",
                      color: THEME.text,
                    }}
                  >
                    清空
                  </button>
                </div>
              </Card>

              {/* profile */}
              <Card accent="navy" title="你的 profile" subtitle="來自 investor_profiles（RLS）">
                <div
                  className="rounded-xl border p-4 text-sm"
                  style={{
                    borderColor: "rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.18)",
                    color: THEME.muted,
                  }}
                >
                  <div className="text-xs" style={{ color: THEME.muted }}>
                    user_id
                  </div>
                  <div className="mt-1 font-semibold" style={{ color: THEME.text }}>
                    {profile?.user_id ?? userId ?? "—"}
                  </div>

                  <div className="mt-3 text-xs" style={{ color: THEME.muted }}>
                    email
                  </div>
                  <div className="mt-1 font-semibold" style={{ color: THEME.text }}>
                    {profile?.email ?? sessionEmail ?? "—"}
                  </div>

                  <div className="mt-3 text-xs" style={{ color: THEME.muted }}>
                    display_name
                  </div>
                  <div className="mt-1 font-semibold" style={{ color: THEME.text }}>
                    {profile?.display_name ?? "—"}
                  </div>
                </div>

                <div className="mt-3 text-xs" style={{ color: THEME.faint }}>
                  下一步我們會做：快照將 PENDING 成交（forward pricing）→ UNPAID，並寫入 executed_at / share_price / shares_to_redeem。
                </div>
              </Card>
            </div>

            {/* 提款列表 */}
            <div className="mt-6">
              <Card
                accent="gold"
                title="提款申請"
                subtitle="只會看到你自己的資料（RLS）"
                right={
                  <div className="text-xs" style={{ color: THEME.muted }}>
                    共 {withdraws.length} 筆
                  </div>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr
                        className="border-b text-left"
                        style={{ borderColor: "rgba(226,198,128,0.18)", color: THEME.muted }}
                      >
                        <th className="py-3 pr-4">時間</th>
                        <th className="py-3 pr-4 text-right">金額(U)</th>
                        <th className="py-3 pr-4">狀態</th>
                        <th className="py-3 pr-4">備註</th>
                        <th className="py-3">操作</th>
                      </tr>
                    </thead>

                    <tbody>
                      {withdraws.length === 0 ? (
                        <tr>
                          <td className="py-6 text-sm" colSpan={5} style={{ color: THEME.muted }}>
                            尚無提款申請
                          </td>
                        </tr>
                      ) : (
                        withdraws.map((w) => {
                          const status = String(w.status || "—").toUpperCase();
                          const st = badgeStyle(status);
                          const canCancel = status === "PENDING";

                          return (
                            <tr
                              key={w.id}
                              className="border-b"
                              style={{ borderColor: "rgba(255,255,255,0.06)" }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLTableRowElement).style.background =
                                  "rgba(212,175,55,0.06)";
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                              }}
                            >
                              <td className="py-3 pr-4" style={{ color: THEME.muted }}>
                                {formatTime(w.created_at)}
                              </td>

                              <td className="py-3 pr-4 text-right" style={{ color: THEME.text, fontWeight: 700 }}>
                                {fmt(w.amount)}
                              </td>

                              <td className="py-3 pr-4">
                                <span
                                  className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold"
                                  style={{
                                    borderColor: st.border,
                                    background: st.bg,
                                    color: st.color,
                                  }}
                                >
                                  {status}
                                </span>
                              </td>

                              <td className="py-3 pr-4" style={{ color: THEME.muted }}>
                                {w.note ?? "—"}
                              </td>

                              <td className="py-3">
                                {canCancel ? (
                                  <button
                                    onClick={() => cancelWithdraw(w.id)}
                                    className="rounded-xl border px-3 py-1.5 text-xs font-semibold"
                                    style={{
                                      borderColor: "rgba(226,198,128,0.18)",
                                      background: "rgba(255,255,255,0.03)",
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
                  Tip：如果你看到「PENDING → UNPAID」是在 GitHub Actions 快照跑完後發生的，代表你的成交流程已接上。
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

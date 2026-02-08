"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Legend,
  Cell,
  CartesianGrid,
} from "recharts";

import { Shell, Card, Metric, THEME, PIE_PALETTE } from "@/components/mf/MfUi";

type OverviewResponse = {
  header: { title: string; last_update: string | null; tags?: string[] };
  kpi: {
    total_nav: number | string | null;
    change_24h: number | string | null;
    change_24h_pct: number | string | null;
    diff_mode?: string | null;
  };
  allocation: { category: string; label: string; value_usdt: number }[];
  nav_history: { timestamp: string; total_nav: number }[];
  distribution: { chain: string; value_usdt: number }[];
  positions: {
    category: string;
    source: string;
    asset: string;
    amount: number | string | null;
    value_usdt: number | string | null;
    chain: string;
  }[];
};

type PrincipalRow = {
  id: number;
  month: string; // YYYY-MM
  delta: number | string;
  note: string | null;
  created_at: string;
};

type WithdrawQueueRow = {
  id: number;
  user_id: string;
  amount: number | string | null;
  status: string | null;
  note: string | null;
  created_at: string;
  updated_at?: string | null;
  executed_at?: string | null;
};

/** ✅ WTD 手動調整（雲端） */
type WtdAdjustmentRow = {
  id: number;
  week_start: string; // YYYY-MM-DD（週日起點）
  delta_usd: number | string;
  note: string | null;
  created_at: string;
};

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtUsd(v: any) {
  const n = num(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtUsdCompact(v: any) {
  const n = num(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(2)}萬`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(0);
}

function formatTime(ts: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function shortDate(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

/** ✅ 穩定版：先讀 text 再 parse */
async function safeReadJson(r: Response) {
  const text = await r.text();
  if (!text) return { ok: r.ok, status: r.status, data: null as any, raw: "" };
  try {
    const data = JSON.parse(text);
    return { ok: r.ok, status: r.status, data, raw: text };
  } catch {
    return { ok: r.ok, status: r.status, data: null as any, raw: text };
  }
}

function LineTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload?.[0]?.value;
  return (
    <div
      className="rounded-xl border px-3 py-2 text-xs shadow-[0_12px_44px_rgba(0,0,0,0.70)] backdrop-blur"
      style={{
        borderColor: "rgba(226,198,128,0.18)",
        background: "rgba(5,7,10,0.82)",
        color: THEME.text,
      }}
    >
      <div style={{ color: THEME.muted }}>{formatTime(label)}</div>
      <div className="mt-1 font-semibold" style={{ color: THEME.gold2 }}>
        ${fmtUsd(v)}
      </div>
    </div>
  );
}

function DoughnutCenter({ total }: { total: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <div className="text-[11px]" style={{ color: THEME.muted }}>
          總資產
        </div>
        <div className="mt-1 text-lg font-semibold" style={{ color: THEME.gold2 }}>
          {fmtUsdCompact(total)} 美元
        </div>
      </div>
    </div>
  );
}

/** ====== ✅ 週日為一週起點（週日歸零） ====== */
function startOfWeekSunday(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun ... 6=Sat
  x.setDate(x.getDate() - day);
  return x;
}

function yyyymmdd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function weekKeyFromISO(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts).slice(0, 10);
  return yyyymmdd(startOfWeekSunday(d)); // 週起點（週日）YYYY-MM-DD
}

function prevWeekKey(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() - 7);
  return yyyymmdd(startOfWeekSunday(d));
}

export default function Page() {
  // ✅ 只隱藏「本金調整（雲端）」的下方列表視窗（不要影響 WTD / 其他視窗）
  const HIDE_PRINCIPAL_LIST = true;

  // ✅ 提款申請總覽：下拉式（避免頁面太長）
  const [wdOpen, setWdOpen] = useState<boolean>(false);

  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [range, setRange] = useState<"7D" | "30D" | "ALL">("7D");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [chainFilter, setChainFilter] = useState<string>("all");

  // principal adjustments (cloud) — 只保留「讀取/列表」
  const [principalRows, setPrincipalRows] = useState<PrincipalRow[]>([]);
  const [principalErr, setPrincipalErr] = useState<string | null>(null);

  // ✅ WTD 手動調整（雲端）— 不動
  const [wtdAdjRows, setWtdAdjRows] = useState<WtdAdjustmentRow[]>([]);
  const [wtdAdjDelta, setWtdAdjDelta] = useState<number>(0);
  const [wtdAdjNote, setWtdAdjNote] = useState<string>("");
  const [wtdAdjErr, setWtdAdjErr] = useState<string | null>(null);
  const [wtdAdjSaving, setWtdAdjSaving] = useState(false);

  // ✅ Admin cookie unlock
  const [adminToken, setAdminToken] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminBusy, setAdminBusy] = useState<boolean>(false);

  // ✅ Withdraw Queue (admin readonly)
  const [wdRows, setWdRows] = useState<WithdrawQueueRow[]>([]);
  const [wdErr, setWdErr] = useState<string | null>(null);
  const [wdLoading, setWdLoading] = useState(false);

  // ✅ execute buttons status
  const [execBusy, setExecBusy] = useState(false);
  const [execMsg, setExecMsg] = useState<string | null>(null);

  // load token from localStorage
  useEffect(() => {
    try {
      const t = localStorage.getItem("moneyflow.admin_token.v1");
      if (t) setAdminToken(t);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (adminToken) localStorage.setItem("moneyflow.admin_token.v1", adminToken);
    } catch {}
  }, [adminToken]);

  async function refreshIsAdmin() {
    try {
      const r = await fetch("/api/admin/me", { cache: "no-store", credentials: "include" });
      const out = await safeReadJson(r);
      setIsAdmin(Boolean(out.data?.is_admin));
    } catch {
      setIsAdmin(false);
    }
  }

  useEffect(() => {
    refreshIsAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function adminLogin() {
    if (!adminToken) throw new Error("請先輸入 ADMIN TOKEN");

    setAdminBusy(true);
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: adminToken }),
        credentials: "include",
        cache: "no-store",
      });
      const out = await safeReadJson(r);
      if (!out.ok) throw new Error(out.data?.error || `Admin login failed (HTTP ${out.status})`);
      await refreshIsAdmin();
    } finally {
      setAdminBusy(false);
    }
  }

  async function adminLogout() {
    setAdminBusy(true);
    try {
      await fetch("/api/admin/logout", { method: "POST", credentials: "include", cache: "no-store" });
      await refreshIsAdmin();
    } finally {
      setAdminBusy(false);
    }
  }

  async function executeDeposits() {
    try {
      setExecMsg(null);
      setPrincipalErr(null);
      setWdErr(null);
      setExecBusy(true);

      if (!isAdmin) await adminLogin();
      await refreshIsAdmin();
      if (!isAdmin) throw new Error("未解鎖 Admin（cookie 未生效）");

      const r = await fetch("/api/admin/execute-deposits", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });

      const out = await safeReadJson(r);
      if (!out.ok) {
        const msg =
          out.data?.error ||
          `Execute deposits failed (HTTP ${out.status})` + (out.raw ? `\n${String(out.raw).slice(0, 260)}` : "");
        throw new Error(msg);
      }

      const executed = Number(out.data?.executed ?? 0);
      const sharePrice = out.data?.share_price_used;
      setExecMsg(`✅ 入金結算完成：executed=${executed}（share_price_used=${sharePrice ?? "—"}）`);

      await reloadPrincipal();
    } catch (e: any) {
      setExecMsg(null);
      setPrincipalErr(e?.message || String(e));
      await refreshIsAdmin();
    } finally {
      setExecBusy(false);
    }
  }

  async function executeWithdrawals() {
    try {
      setExecMsg(null);
      setWdErr(null);
      setExecBusy(true);

      if (!isAdmin) await adminLogin();
      await refreshIsAdmin();
      if (!isAdmin) throw new Error("未解鎖 Admin（cookie 未生效）");

      const r = await fetch("/api/admin/execute-withdrawals", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });

      const out = await safeReadJson(r);
      if (!out.ok) {
        const msg =
          out.data?.error ||
          `Execute withdrawals failed (HTTP ${out.status})` + (out.raw ? `\n${String(out.raw).slice(0, 260)}` : "");
        throw new Error(msg);
      }

      const executed = Number(out.data?.executed ?? 0);
      const sharePrice = out.data?.share_price_used;
      setExecMsg(`✅ 提款結算完成：executed=${executed}（share_price_used=${sharePrice ?? "—"}）`);

      await reloadWithdrawQueue();
    } catch (e: any) {
      setExecMsg(null);
      setWdErr(e?.message || String(e));
      await refreshIsAdmin();
    } finally {
      setExecBusy(false);
    }
  }

  // overview
  useEffect(() => {
    let mounted = true;
    async function run() {
      try {
        setLoading(true);
        setErr(null);
        const r = await fetch("/api/public/overview", { cache: "no-store" });
        const out = await safeReadJson(r);

        if (!out.ok) {
          const msg =
            out.data?.error ||
            `Failed to fetch overview (HTTP ${out.status})` + (out.raw ? `\n${String(out.raw).slice(0, 220)}` : "");
          throw new Error(msg);
        }

        if (!mounted) return;
        setData(out.data as OverviewResponse);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || String(e));
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }
    run();
    return () => {
      mounted = false;
    };
  }, []);

  async function reloadPrincipal() {
    try {
      setPrincipalErr(null);
      const r = await fetch("/api/public/principal", { cache: "no-store" });
      const out = await safeReadJson(r);

      if (!out.ok) {
        const msg =
          out.data?.error ||
          `Failed to fetch principal (HTTP ${out.status})` + (out.raw ? `\n${String(out.raw).slice(0, 220)}` : "");
        throw new Error(msg);
      }

      const rows = (out.data?.rows ?? out.data?.data?.rows ?? out.data?.data ?? []) as PrincipalRow[];
      setPrincipalRows(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      setPrincipalErr(e?.message || String(e));
    }
  }

  async function reloadWtdAdjustments() {
    try {
      setWtdAdjErr(null);
      const r = await fetch("/api/public/wtd-adjustments", { cache: "no-store" });
      const out = await safeReadJson(r);

      if (!out.ok) {
        const msg =
          out.data?.error ||
          `Failed to fetch WTD adjustments (HTTP ${out.status})` +
            (out.raw ? `\n${String(out.raw).slice(0, 220)}` : "");
        throw new Error(msg);
      }

      const rows = (out.data?.rows ?? out.data?.data?.rows ?? out.data?.data ?? []) as WtdAdjustmentRow[];
      setWtdAdjRows(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      setWtdAdjErr(e?.message || String(e));
    }
  }

  useEffect(() => {
    reloadPrincipal();
    reloadWtdAdjustments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addWtdAdjustment() {
    try {
      setWtdAdjErr(null);

      const delta = Number(wtdAdjDelta);
      const note = wtdAdjNote?.trim() || null;
      const weekStart = yyyymmdd(startOfWeekSunday(new Date())); // 本週週日起點

      if (!Number.isFinite(delta) || delta === 0) throw new Error("調整金額不能是 0（可正可負）");

      if (!isAdmin) await adminLogin();
      await refreshIsAdmin();
      if (!isAdmin) throw new Error("未解鎖 Admin（cookie 未生效）");

      setWtdAdjSaving(true);

      const r = await fetch("/api/admin/wtd-adjustments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ week_start: weekStart, delta_usd: delta, note }),
      });

      const out = await safeReadJson(r);
      if (!out.ok) {
        const msg =
          out.data?.error ||
          `Failed to save WTD adjustment (HTTP ${out.status})` + (out.raw ? `\n${String(out.raw).slice(0, 260)}` : "");
        throw new Error(msg);
      }

      setWtdAdjDelta(0);
      setWtdAdjNote("");
      await reloadWtdAdjustments();
    } catch (e: any) {
      setWtdAdjErr(e?.message || String(e));
      await refreshIsAdmin();
    } finally {
      setWtdAdjSaving(false);
    }
  }

  async function reloadWithdrawQueue() {
    try {
      setWdErr(null);
      setWdLoading(true);

      if (!isAdmin) await adminLogin();
      await refreshIsAdmin();
      if (!isAdmin) throw new Error("未解鎖 Admin（cookie 未生效）");

      const r = await fetch("/api/admin/withdraw-queue", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const out = await safeReadJson(r);
      if (!out.ok) {
        const msg =
          out.data?.error ||
          `Failed to fetch withdraw queue (HTTP ${out.status})` + (out.raw ? `\n${String(out.raw).slice(0, 220)}` : "");
        throw new Error(msg);
      }

      const rows = (out.data?.rows ?? []) as WithdrawQueueRow[];
      setWdRows(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      setWdErr(e?.message || String(e));
      await refreshIsAdmin();
    } finally {
      setWdLoading(false);
    }
  }

  const lastUpdate = data?.header?.last_update ?? null;
  const title = data?.header?.title ?? "MoneyFlow Dashboard";
  const tags = data?.header?.tags ?? ["public", "USDT"];
  const totalNav = data?.kpi?.total_nav ?? null;

  const navChartData = useMemo(() => {
    const rows = data?.nav_history ?? [];
    if (rows.length === 0) return [];
    if (range === "ALL") return rows;
    const days = range === "7D" ? 7 : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return rows.filter((r) => new Date(r.timestamp).getTime() >= cutoff);
  }, [data, range]);

  /** ✅ WTD base（只看 NAV Δ；週日歸零） */
  const wtdBaseAllSeries = useMemo(() => {
    const navAll = [...(data?.nav_history ?? [])].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    if (!navAll.length) return [];

    const anchorByWeek = new Map<string, number>();

    return navAll.map((p) => {
      const nav = num(p.total_nav);
      const wk = weekKeyFromISO(p.timestamp);

      if (!anchorByWeek.has(wk)) anchorByWeek.set(wk, nav);
      const anchor = anchorByWeek.get(wk) ?? nav;

      return {
        timestamp: p.timestamp,
        wtd_base: nav - anchor,
        total_nav: nav,
        week_key: wk,
      };
    });
  }, [data]);

  /** ✅ WTD adjustment map（每週一個累加） */
  const wtdAdjByWeek = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of wtdAdjRows ?? []) {
      const wk = String(r.week_start || "").slice(0, 10);
      const v = num(r.delta_usd);
      m.set(wk, (m.get(wk) ?? 0) + v);
    }
    return m;
  }, [wtdAdjRows]);

  /** ✅ 最終 WTD = base + 你手動調整（同週整段加成） */
  const wtdAllSeries = useMemo(() => {
    return (wtdBaseAllSeries ?? []).map((r: any) => {
      const adj = wtdAdjByWeek.get(r.week_key) ?? 0;
      return {
        ...r,
        wtd: num(r.wtd_base) + adj,
        wtd_adj: adj,
      };
    });
  }, [wtdBaseAllSeries, wtdAdjByWeek]);

  const wtdChartData = useMemo(() => {
    if (!wtdAllSeries.length) return [];
    if (range === "ALL") return wtdAllSeries;
    const days = range === "7D" ? 7 : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return wtdAllSeries.filter((r) => new Date(r.timestamp).getTime() >= cutoff);
  }, [wtdAllSeries, range]);

  const latestWtd = wtdChartData[wtdChartData.length - 1];
  const weekPnl = num(latestWtd?.wtd ?? 0);
  const weekPnlPositive = weekPnl >= 0;

  const thisWeekKey = useMemo(() => yyyymmdd(startOfWeekSunday(new Date())), []);
  const thisWeekAdj = useMemo(() => wtdAdjByWeek.get(thisWeekKey) ?? 0, [wtdAdjByWeek, thisWeekKey]);

  const lastWeekPnl = useMemo(() => {
    if (!wtdAllSeries.length) return null;
    const pw = prevWeekKey(new Date());
    const rows = wtdAllSeries.filter((r: any) => r.week_key === pw);
    if (!rows.length) return null;
    const last = rows[rows.length - 1];
    return { week: pw, value: num(last.wtd) };
  }, [wtdAllSeries]);

  const lastWeekLine = lastWeekPnl
    ? `上週損益（週起點 ${lastWeekPnl.week}）：${lastWeekPnl.value >= 0 ? "+" : ""}${fmtUsd(lastWeekPnl.value)} 美元`
    : "上週損益：—";

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of data?.positions ?? []) set.add(p.category);
    return ["all", ...Array.from(set)];
  }, [data]);

  const chainOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of data?.positions ?? []) set.add(p.chain);
    return ["all", ...Array.from(set)];
  }, [data]);

  const filteredPositions = useMemo(() => {
    const rows = data?.positions ?? [];
    const q = search.trim().toLowerCase();

    return rows.filter((p) => {
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (chainFilter !== "all" && p.chain !== chainFilter) return false;

      if (!q) return true;
      const hay = `${p.asset} ${p.chain} ${p.category} ${p.source}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, search, categoryFilter, chainFilter]);

  const allocation = data?.allocation ?? [];
  const dist = data?.distribution ?? [];
  const distTotal = useMemo(() => dist.reduce((acc, x) => acc + num(x.value_usdt), 0), [dist]);

  if (loading) {
    return (
      <div className="min-h-screen p-10" style={{ background: THEME.bg, color: THEME.muted }}>
        <div className="text-sm">Loading…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen p-10" style={{ background: THEME.bg, color: THEME.muted }}>
        <div className="font-semibold" style={{ color: THEME.bad }}>
          Error
        </div>
        <div className="mt-2 text-sm" style={{ color: THEME.muted }}>
          {err}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen p-10" style={{ background: THEME.bg, color: THEME.muted }}>
        <div className="text-sm">No data</div>
      </div>
    );
  }

  return (
    <Shell>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-1">
            <Image src="/logo.png" alt="MoneyFlow" width={120} height={120} className="rounded-xl" />
          </div>

          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {title}
              <span className="ml-3 align-middle text-xs font-semibold" style={{ color: THEME.muted }}>
                Wealth Console
              </span>
            </h1>
            <div className="mt-2 text-sm" style={{ color: THEME.muted }}>
              最後更新：{" "}
              <span className="font-medium" style={{ color: THEME.text }}>
                {formatTime(lastUpdate)}
              </span>
            </div>
          </div>
        </div>

        {/* tags + Investor Login */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/investors"
            className="rounded-full border px-3 py-1 text-xs font-semibold transition"
            style={{
              borderColor: "rgba(255,255,255,0.25)",
              color: "rgba(255,255,255,0.95)",
              background: "rgba(255,255,255,0.10)",
            }}
          >
            Investor Login
          </Link>

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

      {/* KPI */}
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card accent="gold">
          <Metric label="總淨值" value={`${fmtUsd(totalNav)} 美元`} sub="USD" />
        </Card>

        <Card accent={weekPnlPositive ? "good" : "bad"}>
          <Metric
            label="本週損益"
            value={`${weekPnlPositive ? "+" : ""}${fmtUsd(weekPnl)} 美元`}
            sub={`WTD（週日歸零）\n${lastWeekLine}\n= NAV Δ + 手動調整（本週 ${thisWeekAdj >= 0 ? "+" : ""}${fmtUsd(
              thisWeekAdj
            )}）`}
            tone={weekPnlPositive ? "good" : "bad"}
          />
        </Card>

        <Card accent="navy" title="分配" subtitle="按類別匯總">
          <div className="space-y-2">
            {allocation.length === 0 ? (
              <div className="text-sm" style={{ color: THEME.muted }}>
                —
              </div>
            ) : (
              allocation
                .slice()
                .sort((a, b) => (b.value_usdt ?? 0) - (a.value_usdt ?? 0))
                .map((a, idx) => (
                  <div key={a.category} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          background: PIE_PALETTE[idx % PIE_PALETTE.length],
                          boxShadow: "0 0 12px rgba(212,175,55,0.18)",
                        }}
                      />
                      <span style={{ color: THEME.muted }}>{a.label}</span>
                    </div>
                    <div className="font-semibold" style={{ color: THEME.text }}>
                      ${fmtUsd(a.value_usdt)} 美元
                    </div>
                  </div>
                ))
            )}
          </div>
        </Card>
      </div>

      {/* Charts row 1 */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          accent="gold"
          title="淨值歷史"
          subtitle="基於 nav_snapshots"
          right={
            <div className="flex items-center gap-2">
              {(["7D", "30D", "ALL"] as const).map((k) => {
                const active = range === k;
                return (
                  <button
                    key={k}
                    onClick={() => setRange(k)}
                    className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                    style={{
                      borderColor: active ? "rgba(226,198,128,0.42)" : "rgba(148,163,184,0.16)",
                      background: active ? "rgba(212,175,55,0.14)" : "rgba(255,255,255,0.03)",
                      color: active ? THEME.gold2 : THEME.muted,
                      boxShadow: active ? "0 0 18px rgba(212,175,55,0.14)" : undefined,
                    }}
                  >
                    {k === "ALL" ? "全部" : k}
                  </button>
                );
              })}
            </div>
          }
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={navChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.16)" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(v) => shortDate(v)}
                  minTickGap={28}
                  tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `${Math.round(v)}`}
                  width={52}
                  tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<LineTooltip />} />
                <Line
                  type="monotone"
                  dataKey="total_nav"
                  stroke={THEME.gold2}
                  strokeWidth={2.9}
                  dot={false}
                  activeDot={{ r: 4, fill: THEME.gold2, stroke: "rgba(255,255,255,0.35)" }}
                  style={{ filter: "drop-shadow(0 0 12px rgba(212,175,55,0.28))" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card accent="navy" title="分配" subtitle="按鏈（點擊篩選）">
          <div className="relative h-72">
            <DoughnutCenter total={distTotal} />
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dist}
                  dataKey="value_usdt"
                  nameKey="chain"
                  innerRadius="58%"
                  outerRadius="86%"
                  paddingAngle={2}
                  stroke="rgba(255,255,255,0.14)"
                  onClick={(payload: any) => {
                    const clicked = payload?.payload?.chain;
                    if (!clicked) return;
                    setChainFilter((cur) => (cur === clicked ? "all" : clicked));
                  }}
                >
                  {dist.map((_, idx) => (
                    <Cell key={idx} fill={PIE_PALETTE[idx % PIE_PALETTE.length]} />
                  ))}
                </Pie>

                <Tooltip
                  formatter={(v: any) => `$${fmtUsd(v)}`}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(226,198,128,0.18)",
                    background: "rgba(5,7,10,0.82)",
                    color: THEME.text,
                  }}
                />
                <Legend wrapperStyle={{ color: "rgba(255,255,255,0.72)" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 text-xs" style={{ color: THEME.muted }}>
            當前鏈過濾器：{" "}
            <span className="font-semibold" style={{ color: THEME.gold2 }}>
              {chainFilter === "all" ? "全部" : chainFilter}
            </span>
          </div>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 左：WTD + 手動調整（不動） */}
        <Card
          className="lg:col-span-2"
          accent="good"
          title="本週損益（NAV Δ + 手動調整）"
          subtitle="每週日歸零；不受投資人出入金影響；手動調整需 Admin 權限"
          right={
            <div className="text-right text-xs" style={{ color: THEME.muted }}>
              最新本週損益：{" "}
              <span style={{ color: THEME.text, fontWeight: 700 }}>${fmtUsd(latestWtd?.wtd ?? 0)}</span>
              <div className="mt-1" style={{ color: THEME.muted }}>
                本週手動調整：{" "}
                <span style={{ color: THEME.text, fontWeight: 700 }}>
                  {thisWeekAdj >= 0 ? "+" : ""}
                  {fmtUsd(thisWeekAdj)}
                </span>
              </div>
            </div>
          }
        >
          {/* 上：圖 */}
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={wtdChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.16)" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(v) => shortDate(v)}
                  minTickGap={28}
                  tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `${Math.round(v)}`}
                  width={52}
                  tick={{ fontSize: 12, fill: "rgba(255,255,255,0.55)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: any) => [`$${fmtUsd(v)}`, "本週損益"]}
                  labelFormatter={(l) => formatTime(l)}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid rgba(226,198,128,0.18)",
                    background: "rgba(5,7,10,0.82)",
                    color: THEME.text,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="wtd"
                  name="wtd"
                  stroke={THEME.good}
                  strokeWidth={2.6}
                  dot={false}
                  style={{ filter: "drop-shadow(0 0 10px rgba(34,197,94,0.22))" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 下：手動調整 */}
          <div
            className="mt-4 rounded-2xl border p-4"
            style={{ borderColor: "rgba(226,198,128,0.18)", background: "rgba(255,255,255,0.02)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold" style={{ color: THEME.text }}>
                  本週損益手動調整（Admin）
                </div>
                <div className="mt-1 text-xs" style={{ color: THEME.muted }}>
                  只影響 WTD 顯示：WTD = NAV Δ + 調整值；不影響 NAV、不影響投資人帳務。
                </div>
              </div>

              <button
                onClick={reloadWtdAdjustments}
                className="shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold"
                style={{
                  borderColor: "rgba(226,198,128,0.18)",
                  background: "rgba(255,255,255,0.03)",
                  color: THEME.text,
                }}
              >
                重新載入
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <div className="text-xs mb-1" style={{ color: THEME.muted }}>
                  本週起點（週日）
                </div>
                <div
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={{
                    borderColor: "rgba(226,198,128,0.18)",
                    background: "rgba(0,0,0,0.18)",
                    color: THEME.text,
                  }}
                >
                  {thisWeekKey}
                </div>
              </div>

              <div className="col-span-1">
                <div className="text-xs mb-1" style={{ color: THEME.muted }}>
                  調整金額（USD，+ / -）
                </div>
                <input
                  value={wtdAdjDelta}
                  onChange={(e) => setWtdAdjDelta(Number(e.target.value))}
                  type="number"
                  placeholder="+10 / -10"
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{
                    borderColor: "rgba(226,198,128,0.18)",
                    background: "rgba(255,255,255,0.03)",
                    color: THEME.text,
                  }}
                />
              </div>

              <div className="col-span-1">
                <div className="text-xs mb-1" style={{ color: THEME.muted }}>
                  備註（可空）
                </div>
                <input
                  value={wtdAdjNote}
                  onChange={(e) => setWtdAdjNote(e.target.value)}
                  placeholder="例如：手動對帳修正"
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{
                    borderColor: "rgba(226,198,128,0.18)",
                    background: "rgba(255,255,255,0.03)",
                    color: THEME.text,
                  }}
                />
              </div>
            </div>

            <button
              disabled={wtdAdjSaving}
              onClick={addWtdAdjustment}
              className="mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold transition-opacity"
              style={{
                background: isAdmin ? THEME.gold2 : "rgba(148,163,184,0.25)",
                color: isAdmin ? "#0B0E14" : THEME.muted,
                opacity: wtdAdjSaving ? 0.7 : 1,
              }}
              title={isAdmin ? "寫入本週損益調整" : "請先解鎖 Admin（右側）"}
            >
              {wtdAdjSaving ? "儲存中…" : "新增一筆（本週損益調整）"}
            </button>

            <div className="mt-3 text-xs" style={{ color: THEME.muted }}>
              本週累積調整：{" "}
              <span style={{ color: THEME.text, fontWeight: 700 }}>
                {thisWeekAdj >= 0 ? "+" : ""}
                {fmtUsd(thisWeekAdj)}
              </span>
            </div>

            {wtdAdjErr ? (
              <div className="mt-2 text-xs whitespace-pre-line" style={{ color: THEME.bad }}>
                {wtdAdjErr}
              </div>
            ) : null}

            <div
              className="mt-2 max-h-40 overflow-auto rounded-xl border p-3 text-xs"
              style={{
                borderColor: "rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.18)",
                color: THEME.muted,
              }}
            >
              {wtdAdjRows.length === 0 ? (
                <div>尚無 WTD 調整紀錄</div>
              ) : (
                <div className="space-y-2">
                  {wtdAdjRows
                    .slice()
                    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
                    .map((r) => (
                      <div key={r.id} className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold" style={{ color: THEME.text }}>
                            {String(r.week_start).slice(0, 10)}
                          </span>{" "}
                          <span style={{ color: THEME.muted }}>{r.note || ""}</span>
                        </div>
                        <div style={{ color: THEME.gold2, fontWeight: 700 }}>
                          {num(r.delta_usd) >= 0 ? "+" : ""}
                          {fmtUsd(r.delta_usd)}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* 右：本金調整（雲端） */}
        <Card
          accent="gold"
          title="本金調整（雲端）"
          subtitle="只讀：保留 Admin 解鎖/結算/載入；本金列表隱藏；內含提款申請總覽（下拉）"
        >
          <div className="space-y-3">
            <div>
              <div className="text-xs mb-1" style={{ color: THEME.muted }}>
                ADMIN TOKEN（只用來解鎖 cookie；不會再傳到其他 API）
              </div>
              <input
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                placeholder="貼上你在 Vercel 設的 ADMIN_TOKEN"
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                style={{
                  borderColor: "rgba(226,198,128,0.18)",
                  background: "rgba(255,255,255,0.03)",
                  color: THEME.text,
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={adminLogin}
                disabled={adminBusy}
                className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold"
                style={{
                  background: isAdmin ? "rgba(34,197,94,0.18)" : "rgba(212,175,55,0.95)",
                  color: isAdmin ? THEME.text : "#0B0E14",
                  opacity: adminBusy ? 0.7 : 1,
                }}
              >
                {isAdmin ? "已解鎖（12hr）" : adminBusy ? "解鎖中…" : "解鎖 Admin（換 cookie）"}
              </button>

              <button
                onClick={adminLogout}
                disabled={adminBusy}
                className="rounded-xl border px-3 py-2 text-sm font-semibold"
                style={{
                  borderColor: "rgba(226,198,128,0.18)",
                  background: "rgba(255,255,255,0.03)",
                  color: THEME.text,
                  opacity: adminBusy ? 0.7 : 1,
                }}
              >
                登出
              </button>
            </div>

            {/* Execute buttons */}
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={executeDeposits}
                disabled={execBusy}
                className="w-full rounded-xl border px-3 py-2 text-sm font-semibold"
                style={{
                  borderColor: "rgba(226,198,128,0.18)",
                  background: "rgba(255,255,255,0.03)",
                  color: THEME.text,
                  opacity: execBusy ? 0.7 : 1,
                }}
                title="把所有 PENDING 入金用當下 share_price 鑄造成 shares（同一批用同價格）"
              >
                {execBusy ? "結算中…" : "結算入金（Execute Deposits）"}
              </button>

              <button
                onClick={executeWithdrawals}
                disabled={execBusy}
                className="w-full rounded-xl border px-3 py-2 text-sm font-semibold"
                style={{
                  borderColor: "rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.02)",
                  color: THEME.muted,
                  opacity: execBusy ? 0.7 : 1,
                }}
                title="把所有 PENDING 提款用當下 share_price 換算 burn shares，更新為 UNPAID"
              >
                {execBusy ? "結算中…" : "結算提款（Execute Withdrawals）"}
              </button>

              {execMsg ? (
                <div className="text-xs whitespace-pre-line" style={{ color: THEME.good }}>
                  {execMsg}
                </div>
              ) : null}
            </div>

            <button
              onClick={reloadPrincipal}
              className="w-full rounded-xl border px-3 py-2 text-sm font-semibold"
              style={{
                borderColor: "rgba(226,198,128,0.18)",
                background: "rgba(255,255,255,0.03)",
                color: THEME.text,
              }}
            >
              重新載入本金紀錄
            </button>

            {principalErr ? (
              <div className="text-xs whitespace-pre-line" style={{ color: THEME.bad }}>
                {principalErr}
              </div>
            ) : null}

            {/* ✅ 本金列表仍維持隱藏 */}
            {!HIDE_PRINCIPAL_LIST ? (
              <div
                className="mt-2 max-h-48 overflow-auto rounded-xl border p-3 text-xs"
                style={{
                  borderColor: "rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.18)",
                  color: THEME.muted,
                }}
              >
                {principalRows.length === 0 ? (
                  <div>尚無紀錄</div>
                ) : (
                  <div className="space-y-2">
                    {principalRows
                      .slice()
                      .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
                      .map((r) => (
                        <div key={r.id} className="flex items-center justify-between">
                          <div>
                            <span className="font-semibold" style={{ color: THEME.text }}>
                              {r.month}
                            </span>{" "}
                            <span style={{ color: THEME.muted }}>{r.note || ""}</span>
                          </div>
                          <div style={{ color: THEME.gold2, fontWeight: 700 }}>
                            {num(r.delta) >= 0 ? "+" : ""}
                            {fmtUsd(r.delta)}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* ✅ 提款申請總覽（下拉式 + 內部滾動） */}
            <div className="mt-4 rounded-2xl border p-3" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
              {/* ✅ 這裡修掉：外層不要用 button，改成 div role=button（避免 button 包 button） */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={wdOpen}
                onClick={() => setWdOpen((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setWdOpen((v) => !v);
                  }
                }}
                className="w-full cursor-pointer select-none"
                style={{ color: THEME.text }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold" style={{ color: THEME.text }}>
                      提款申請總覽
                      <span className="ml-2 text-xs" style={{ color: THEME.muted }}>
                        {wdOpen ? "（收起）" : "（展開）"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs" style={{ color: THEME.muted }}>
                      提款狀態
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span
                      className="rounded-full border px-2 py-0.5 text-xs"
                      style={{
                        borderColor: "rgba(255,255,255,0.14)",
                        background: "rgba(255,255,255,0.04)",
                        color: THEME.muted,
                      }}
                    >
                      {wdRows.length} 筆
                    </span>

                    {/* ✅ 內層這顆仍是 button，合法（因為外層已經不是 button） */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation(); // ✅ 避免觸發外層展開/收起
                        reloadWithdrawQueue();
                        setWdOpen(true);
                      }}
                      disabled={wdLoading}
                      className="rounded-xl border px-3 py-2 text-xs font-semibold"
                      style={{
                        borderColor: "rgba(226,198,128,0.18)",
                        background: "rgba(255,255,255,0.03)",
                        color: THEME.text,
                        opacity: wdLoading ? 0.7 : 1,
                      }}
                    >
                      {wdLoading ? "載入中…" : "重新載入"}
                    </button>
                  </div>
                </div>
              </div>

              {/* body */}
              {wdOpen ? (
                <div className="mt-3">
                  {wdErr ? (
                    <div className="mb-2 text-xs whitespace-pre-line" style={{ color: THEME.bad }}>
                      {wdErr}
                    </div>
                  ) : null}

                  <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr
                            className="border-b text-left"
                            style={{ borderColor: "rgba(255,255,255,0.10)", color: THEME.muted }}
                          >
                            <th className="py-3 px-4">時間</th>
                            <th className="py-3 px-4">狀態</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wdRows.length === 0 ? (
                            <tr>
                              <td className="py-4 px-4" colSpan={2} style={{ color: THEME.muted }}>
                                尚無資料（請先按「重新載入」）
                              </td>
                            </tr>
                          ) : (
                            wdRows.map((r) => {
                              const st = (r.status ?? "").toUpperCase();
                              const stTone =
                                st === "PENDING"
                                  ? THEME.gold2
                                  : st === "CANCELLED"
                                  ? "rgba(148,163,184,0.9)"
                                  : THEME.text;

                              return (
                                <tr key={r.id} className="border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                                  <td className="py-3 px-4" style={{ color: THEME.muted }}>
                                    {new Date(r.created_at).toLocaleString()}
                                  </td>
                                  <td className="py-3 px-4">
                                    <span
                                      className="rounded-full border px-2 py-0.5 text-xs"
                                      style={{
                                        borderColor: "rgba(255,255,255,0.14)",
                                        background: "rgba(255,255,255,0.05)",
                                        color: stTone,
                                      }}
                                    >
                                      {st || "—"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      {/* Positions */}
      <Card
        className="mt-6"
        accent="gold"
        title="持倉明細"
        subtitle={`${filteredPositions.length} 行`}
        right={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋 資產 / 鏈 / 類別"
              className="w-full sm:w-80 rounded-xl border px-3 py-2 text-sm outline-none"
              style={{
                borderColor: "rgba(226,198,128,0.18)",
                background: "rgba(255,255,255,0.03)",
                color: THEME.text,
              }}
            />

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
              style={{
                borderColor: "rgba(226,198,128,0.18)",
                background: "rgba(255,255,255,0.03)",
                color: THEME.text,
              }}
            >
              {categoryOptions.map((c) => (
                <option key={c} value={c} className="bg-[#07090D]">
                  {c === "all" ? "所有類別" : c}
                </option>
              ))}
            </select>

            <select
              value={chainFilter}
              onChange={(e) => setChainFilter(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
              style={{
                borderColor: "rgba(226,198,128,0.18)",
                background: "rgba(255,255,255,0.03)",
                color: THEME.text,
              }}
            >
              {chainOptions.map((c) => (
                <option key={c} value={c} className="bg-[#07090D]">
                  {c === "all" ? "所有鏈" : c}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "rgba(226,198,128,0.18)", color: THEME.muted }}>
                <th className="py-3 pr-4">資產</th>
                <th className="py-3 pr-4 text-right">金額</th>
                <th className="py-3 pr-4 text-right">價值（USD）</th>
                <th className="py-3">鏈</th>
              </tr>
            </thead>
            <tbody>
              {filteredPositions.map((p, idx) => (
                <tr
                  key={idx}
                  className="border-b transition-colors"
                  style={{ borderColor: "rgba(255,255,255,0.06)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = "rgba(212,175,55,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                  }}
                >
                  <td className="py-3 pr-4" style={{ color: THEME.gold2, fontWeight: 700 }}>
                    {p.asset}
                  </td>
                  <td className="py-3 pr-4 text-right" style={{ color: THEME.muted }}>
                    {p.amount == null ? "—" : String(p.amount)}
                  </td>
                  <td className="py-3 pr-4 text-right font-semibold" style={{ color: THEME.text }}>
                    ${fmtUsd(p.value_usdt)}
                  </td>
                  <td className="py-3" style={{ color: THEME.muted }}>
                    {p.chain}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs" style={{ color: THEME.faint }}>
          Note: PnL uses diff_mode=prev until you have enough 24h history.
        </div>
      </Card>
    </Shell>
  );
}

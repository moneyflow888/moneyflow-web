"use client";

import React, { useEffect, useMemo, useState } from "react";
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

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

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

function fmtPct(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(4)}%`;
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

/**
 * (GOLD) 金融金色主題（穩重、資產管理感）
 * - 背景：深墨黑 + 微暖灰
 * - 主色：金色（Amber/Gold）
 * - 輔色：深藍（信任感）、成功綠、風險紅
 * - 卡片：微金邊框 + 霧面玻璃
 */
const THEME = {
  bg: "#07090D", // near-black
  bg2: "#0B0E14", // deep slate
  card: "rgba(255,255,255,0.04)",
  card2: "rgba(255,255,255,0.06)",
  border: "rgba(226, 198, 128, 0.18)", // gold-ish border
  borderSoft: "rgba(148,163,184,0.16)", // neutral border
  text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.62)",
  faint: "rgba(255,255,255,0.42)",

  gold: "#D4AF37", // classic gold
  gold2: "#F2D27D", // light gold highlight
  gold3: "#B68A2A", // deep gold

  navy: "#1D4ED8", // blue-700 (trust accent)
  navy2: "#60A5FA", // blue-400 (soft)
  good: "#22c55e",
  bad: "#ef4444",
};

/** 甜甜圈：金色+藍系+中性灰（金融感，不螢光） */
const PIE_PALETTE = [
  THEME.gold, // primary
  THEME.navy2, // soft blue
  "#94a3b8", // slate
  "#f59e0b", // amber (alt)
  "#38bdf8", // sky
];

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
      {/* top bar */}
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{
          background: `linear-gradient(90deg, ${accentColor} 0%, rgba(226,198,128,0) 72%)`,
          opacity: 0.95,
        }}
      />
      {/* subtle corner glow */}
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

      <div className={clsx(title || subtitle || right ? "px-6 pb-6 pt-4" : "p-6")}>
        {children}
      </div>
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
  const toneColor =
    tone === "good" ? THEME.good : tone === "bad" ? THEME.bad : THEME.text;

  const dotColor =
    tone === "good" ? THEME.good : tone === "bad" ? THEME.bad : THEME.gold;

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

      {sub ? <div className="mt-1 text-xs" style={{ color: THEME.muted }}>{sub}</div> : null}
    </div>
  );
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

export default function Page() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [range, setRange] = useState<"7D" | "30D" | "ALL">("7D");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [chainFilter, setChainFilter] = useState<string>("all");

  useEffect(() => {
    let mounted = true;
    async function run() {
      try {
        setLoading(true);
        setErr(null);
        const r = await fetch("/api/public/overview", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Failed to fetch overview");
        if (!mounted) return;
        setData(j);
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

  const lastUpdate = data?.header?.last_update ?? null;
  const title = data?.header?.title ?? "MoneyFlow Dashboard";
  const tags = data?.header?.tags ?? ["public", "USDT"];

  const totalNav = data?.kpi?.total_nav ?? null;
  const pnlAbs = data?.kpi?.change_24h ?? null;
  const pnlPct = data?.kpi?.change_24h_pct ?? null;

  const pnlAbsNum = Number(pnlAbs);
  const pnlPositive = Number.isFinite(pnlAbsNum) ? pnlAbsNum >= 0 : null;

  const navChartData = useMemo(() => {
    const rows = data?.nav_history ?? [];
    if (rows.length === 0) return [];
    if (range === "ALL") return rows;
    const days = range === "7D" ? 7 : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return rows.filter((r) => new Date(r.timestamp).getTime() >= cutoff);
  }, [data, range]);

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
      const hay = `${p.asset} ${p.source} ${p.chain} ${p.category}`.toLowerCase();
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
    <div className="min-h-screen" style={{ background: THEME.bg, color: THEME.text }}>
      {/* 金融感背景：金色光暈 + 深藍陰影 */}
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
        {/* subtle vignette */}
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
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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

          <div className="flex flex-wrap items-center gap-2">
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

          <Card accent={pnlPositive ? "good" : "bad"}>
            <Metric
              label="損益（最新差異）"
              value={
                pnlAbs == null
                  ? "—"
                  : `${pnlPositive ? "+" : ""}${fmtUsd(pnlAbs)} 美元`
              }
              sub={fmtPct(pnlPct)}
              tone={pnlPositive === null ? "neutral" : pnlPositive ? "good" : "bad"}
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

        {/* Charts */}
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
                  <defs>
                    <linearGradient id="goldLine" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={THEME.gold2} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={THEME.gold2} stopOpacity={0} />
                    </linearGradient>
                  </defs>

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
                    style={{
                      filter: "drop-shadow(0 0 12px rgba(212,175,55,0.28))",
                    }}
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
                placeholder="搜尋 資產 / 來源 / 鏈 / 類別"
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
                <tr
                  className="border-b text-left"
                  style={{ borderColor: "rgba(226,198,128,0.18)", color: THEME.muted }}
                >
                  <th className="py-3 pr-4">類別</th>
                  <th className="py-3 pr-4">來源</th>
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
                      (e.currentTarget as HTMLTableRowElement).style.background =
                        "rgba(212,175,55,0.06)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                    }}
                  >
                    <td className="py-3 pr-4 font-semibold" style={{ color: THEME.text }}>
                      {p.category}
                    </td>
                    <td className="py-3 pr-4" style={{ color: THEME.muted }}>
                      {p.source}
                    </td>
                    <td className="py-3 pr-4" style={{ color: THEME.gold2 }}>
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
      </div>
    </div>
  );
}

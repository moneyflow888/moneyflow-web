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
 * Web3 neon palette
 * (Recharts needs explicit fill colors per Cell)
 */
const PIE_COLORS = [
  "#22d3ee", // cyan-400
  "#a78bfa", // violet-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#fb7185", // rose-400
  "#60a5fa", // blue-400
];

function GlassCard({
  title,
  subtitle,
  right,
  children,
  className,
  accent = "cyan",
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  accent?: "cyan" | "violet" | "emerald" | "amber" | "rose" | "blue";
}) {
  const bar =
    accent === "cyan"
      ? "from-cyan-400/90 to-cyan-400/0"
      : accent === "violet"
      ? "from-violet-400/90 to-violet-400/0"
      : accent === "emerald"
      ? "from-emerald-400/90 to-emerald-400/0"
      : accent === "amber"
      ? "from-amber-400/90 to-amber-400/0"
      : accent === "rose"
      ? "from-rose-400/90 to-rose-400/0"
      : "from-blue-400/90 to-blue-400/0";

  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl",
        "shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
        "transition-transform transition-shadow hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
        className
      )}
    >
      {/* top neon bar */}
      <div className={clsx("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", bar)} />

      {(title || subtitle || right) && (
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div>
            {title && <div className="text-sm font-semibold text-white/90">{title}</div>}
            {subtitle && <div className="mt-1 text-xs text-white/50">{subtitle}</div>}
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
  const toneClass =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
      ? "text-rose-300"
      : "text-white";

  const dot =
    tone === "good"
      ? "bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.65)]"
      : tone === "bad"
      ? "bg-rose-400 shadow-[0_0_14px_rgba(251,113,133,0.65)]"
      : "bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.55)]";

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-white/60">
        <span className={clsx("h-2 w-2 rounded-full", dot)} />
        <span>{label}</span>
      </div>
      <div className={clsx("mt-2 text-3xl font-semibold tracking-tight", toneClass)}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-white/50">{sub}</div> : null}
    </div>
  );
}

function LineTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload?.[0]?.value;
  return (
    <div className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs text-white shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur">
      <div className="text-white/60">{formatTime(label)}</div>
      <div className="mt-1 font-semibold text-white">${fmtUsd(v)}</div>
    </div>
  );
}

function PieCenter({ total }: { total: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <div className="text-[11px] text-white/55">全部的</div>
        <div className="mt-1 text-lg font-semibold text-white">
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
      <div className="min-h-screen bg-[#070A12] p-10 text-white/70">
        <div className="text-sm">Loading…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-[#070A12] p-10 text-white/70">
        <div className="text-rose-300 font-semibold">Error</div>
        <div className="mt-2 text-sm text-white/70">{err}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#070A12] p-10 text-white/70">
        <div className="text-sm">No data</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070A12] text-white">
      {/* neon background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute top-40 -right-24 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute bottom-10 left-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {title}
              <span className="ml-3 align-middle text-xs font-semibold text-white/60">
                Web3 Dashboard
              </span>
            </h1>
            <div className="mt-2 text-sm text-white/60">
              最後更新： <span className="font-medium text-white/85">{formatTime(lastUpdate)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tags.map((t, i) => (
              <span
                key={t}
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs font-semibold",
                  i === 0
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                    : "border-violet-400/30 bg-violet-400/10 text-violet-200"
                )}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* KPI */}
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <GlassCard accent="cyan">
            <Metric label="總淨值" value={`${fmtUsd(totalNav)} 美元`} sub="美元" />
          </GlassCard>

          <GlassCard accent={pnlPositive ? "emerald" : "rose"}>
            <Metric
              label="PnL（最新差異）"
              value={
                pnlAbs == null
                  ? "—"
                  : `${pnlPositive ? "+" : ""}${fmtUsd(pnlAbs)} 美元`
              }
              sub={fmtPct(pnlPct)}
              tone={pnlPositive === null ? "neutral" : pnlPositive ? "good" : "bad"}
            />
          </GlassCard>

          <GlassCard accent="violet" title="分配" subtitle="按類別匯總">
            <div className="space-y-2">
              {allocation.length === 0 ? (
                <div className="text-sm text-white/60">—</div>
              ) : (
                allocation
                  .slice()
                  .sort((a, b) => (b.value_usdt ?? 0) - (a.value_usdt ?? 0))
                  .map((a, idx) => (
                    <div key={a.category} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-white/80">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                        />
                        <span>{a.label}</span>
                      </div>
                      <div className="font-semibold text-white">${fmtUsd(a.value_usdt)} 美元</div>
                    </div>
                  ))
              )}
            </div>
          </GlassCard>
        </div>

        {/* Charts */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <GlassCard
            className="lg:col-span-2"
            accent="cyan"
            title="淨航歷史紀錄"
            subtitle="基於 nav_snapshots"
            right={
              <div className="flex items-center gap-2">
                {(["7D", "30D", "ALL"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setRange(k)}
                    className={clsx(
                      "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                      range === k
                        ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.22)]"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                    )}
                  >
                    {k === "ALL" ? "全部" : k}
                  </button>
                ))}
              </div>
            }
          >
            <div className="h-72 text-cyan-300">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={navChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="navGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="currentColor" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" />
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
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 4 }}
                    style={{
                      filter: "drop-shadow(0 0 10px rgba(34,211,238,0.35))",
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <GlassCard accent="violet" title="分配" subtitle="依鏈式（點擊篩選）">
            <div className="relative h-72">
              <PieCenter total={distTotal} />
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dist}
                    dataKey="value_usdt"
                    nameKey="chain"
                    innerRadius="58%"
                    outerRadius="86%"
                    paddingAngle={2}
                    onClick={(payload: any) => {
                      const clicked = payload?.payload?.chain;
                      if (!clicked) return;
                      setChainFilter((cur) => (cur === clicked ? "all" : clicked));
                    }}
                  >
                    {dist.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: any) => `$${fmtUsd(v)}`}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(0,0,0,0.55)",
                      color: "white",
                    }}
                  />
                  <Legend
                    wrapperStyle={{ color: "rgba(255,255,255,0.70)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-2 text-xs text-white/60">
              當前鏈過濾器：{" "}
              <span className="font-semibold text-white">
                {chainFilter === "all" ? "全部" : chainFilter}
              </span>
            </div>
          </GlassCard>
        </div>

        {/* Positions */}
        <GlassCard
          className="mt-6"
          accent="blue"
          title="職位"
          subtitle={`${filteredPositions.length} 行`}
          right={
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜尋資產/來源/鏈條/類別"
                className="w-full sm:w-80 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none placeholder:text-white/35 focus:border-cyan-300/40 focus:bg-white/10"
              />

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85"
              >
                {categoryOptions.map((c) => (
                  <option key={c} value={c} className="bg-[#070A12]">
                    {c === "all" ? "所有類別" : c}
                  </option>
                ))}
              </select>

              <select
                value={chainFilter}
                onChange={(e) => setChainFilter(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/85"
              >
                {chainOptions.map((c) => (
                  <option key={c} value={c} className="bg-[#070A12]">
                    {c === "all" ? "所有鏈條" : c}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-white/60">
                  <th className="py-3 pr-4">類別</th>
                  <th className="py-3 pr-4">來源</th>
                  <th className="py-3 pr-4">資產</th>
                  <th className="py-3 pr-4 text-right">金額</th>
                  <th className="py-3 pr-4 text-right">價值（USD）</th>
                  <th className="py-3">鏈條</th>
                </tr>
              </thead>
              <tbody>
                {filteredPositions.map((p, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="py-3 pr-4 font-semibold text-white/90">{p.category}</td>
                    <td className="py-3 pr-4 text-white/75">{p.source}</td>
                    <td className="py-3 pr-4 text-white">{p.asset}</td>
                    <td className="py-3 pr-4 text-right text-white/75">
                      {p.amount == null ? "—" : String(p.amount)}
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold text-white">
                      ${fmtUsd(p.value_usdt)}
                    </td>
                    <td className="py-3 text-white/75">{p.chain}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-white/50">
            Note: PnL uses diff_mode=prev until you have enough 24h history.
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

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
  // e.g. 9,293 -> 9.29K
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
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

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function Card({
  title,
  subtitle,
  right,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md",
        className
      )}
    >
      {(title || subtitle || right) && (
        <div className="flex items-start justify-between gap-4">
          <div>
            {title && <div className="text-sm font-semibold text-slate-900">{title}</div>}
            {subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      )}
      <div className={clsx(title || subtitle || right ? "mt-4" : "")}>{children}</div>
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
    tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-slate-900";
  const dotClass =
    tone === "good" ? "bg-emerald-500" : tone === "bad" ? "bg-rose-500" : "bg-slate-900";

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className={clsx("h-2 w-2 rounded-full", dotClass)} />
        <span>{label}</span>
      </div>
      <div className={clsx("mt-2 text-3xl font-semibold tracking-tight", toneClass)}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
  valueLabel = "Value",
}: any) {
  if (!active || !payload?.length) return null;
  const v = payload?.[0]?.value;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="text-slate-500">{formatTime(label)}</div>
      <div className="mt-1 font-medium text-slate-900">
        {valueLabel}: ${fmtUsd(v)}
      </div>
    </div>
  );
}

function PieCenterLabel({ total }: { total: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <div className="text-[11px] text-slate-500">Total</div>
        <div className="mt-1 text-lg font-semibold text-slate-900">${fmtUsdCompact(total)}</div>
      </div>
    </div>
  );
}

export default function Page() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // UI controls
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

  // NAV range slice
  const navChartData = useMemo(() => {
    const rows = data?.nav_history ?? [];
    if (rows.length === 0) return [];
    if (range === "ALL") return rows;
    const days = range === "7D" ? 7 : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return rows.filter((r) => new Date(r.timestamp).getTime() >= cutoff);
  }, [data, range]);

  // Filter options
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

  // Positions filtered
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

  // Allocation (quick list)
  const allocation = data?.allocation ?? [];

  // Distribution (pie)
  const dist = data?.distribution ?? [];
  const distTotal = useMemo(() => dist.reduce((acc, x) => acc + num(x.value_usdt), 0), [dist]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="text-rose-600 font-medium">Error</div>
        <div className="text-sm text-slate-700 mt-2">{err}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="text-sm text-slate-500">No data</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <div className="mt-1 text-sm text-slate-500">
              Last update: <span className="font-medium text-slate-700">{formatTime(lastUpdate)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <Metric label="Total NAV" value={`$${fmtUsd(totalNav)}`} sub="USDT" />
          </Card>

          <Card>
            <Metric
              label="PnL (latest diff)"
              value={
                pnlAbs == null
                  ? "—"
                  : `${pnlPositive ? "+" : ""}$${fmtUsd(pnlAbs)}`
              }
              sub={fmtPct(pnlPct)}
              tone={pnlPositive === null ? "neutral" : pnlPositive ? "good" : "bad"}
            />
          </Card>

          <Card title="Allocation" subtitle="Summary by category">
            <div className="space-y-2">
              {allocation.length === 0 ? (
                <div className="text-sm text-slate-500">—</div>
              ) : (
                allocation
                  .slice()
                  .sort((a, b) => (b.value_usdt ?? 0) - (a.value_usdt ?? 0))
                  .map((a) => (
                    <div
                      key={a.category}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="text-slate-700">{a.label}</div>
                      <div className="font-semibold text-slate-900">${fmtUsd(a.value_usdt)}</div>
                    </div>
                  ))
              )}
            </div>
          </Card>
        </div>

        {/* Charts */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Left: NAV history */}
          <Card
            className="lg:col-span-2"
            title="NAV history"
            subtitle="Based on nav_snapshots"
            right={
              <div className="flex items-center gap-2">
                {(["7D", "30D", "ALL"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setRange(k)}
                    className={clsx(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      range === k
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    {k}
                  </button>
                ))}
              </div>
            }
          >
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={navChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(v) => shortDate(v)}
                    minTickGap={28}
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `${Math.round(v)}`}
                    width={52}
                    tick={{ fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip valueLabel="NAV" />} />
                  <Line
                    type="monotone"
                    dataKey="total_nav"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Right: Distribution doughnut */}
          <Card title="Distribution" subtitle="By chain (click to filter)">
            <div className="relative h-72">
              <PieCenterLabel total={distTotal} />
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
                      <Cell key={idx} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: any) => `$${fmtUsd(v)}`}
                    contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-2 text-xs text-slate-500">
              Current chain filter:{" "}
              <span className="font-semibold text-slate-800">
                {chainFilter === "all" ? "all" : chainFilter}
              </span>
            </div>
          </Card>
        </div>

        {/* Positions */}
        <Card
          className="mt-6"
          title="Positions"
          subtitle={`${filteredPositions.length} rows`}
          right={
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search asset / source / chain / category"
                className="w-full sm:w-80 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
              />

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c === "all" ? "All categories" : c}
                  </option>
                ))}
              </select>

              <select
                value={chainFilter}
                onChange={(e) => setChainFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {chainOptions.map((c) => (
                  <option key={c} value={c}>
                    {c === "all" ? "All chains" : c}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-3 pr-4">Category</th>
                  <th className="py-3 pr-4">Source</th>
                  <th className="py-3 pr-4">Asset</th>
                  <th className="py-3 pr-4 text-right">Amount</th>
                  <th className="py-3 pr-4 text-right">Value (USDT)</th>
                  <th className="py-3">Chain</th>
                </tr>
              </thead>
              <tbody>
                {filteredPositions.map((p, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-3 pr-4 font-medium text-slate-900">{p.category}</td>
                    <td className="py-3 pr-4 text-slate-700">{p.source}</td>
                    <td className="py-3 pr-4 text-slate-900">{p.asset}</td>
                    <td className="py-3 pr-4 text-right text-slate-700">
                      {p.amount == null ? "—" : String(p.amount)}
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold text-slate-900">
                      ${fmtUsd(p.value_usdt)}
                    </td>
                    <td className="py-3 text-slate-700">{p.chain}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-slate-500">
            Note: PnL uses diff_mode=prev until you have enough 24h history.
          </div>
        </Card>
      </div>
    </div>
  );
}

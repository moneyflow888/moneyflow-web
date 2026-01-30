import { supabase } from "../lib/supabaseClient";

type NavRow = {
  timestamp: string;
  total_nav: number | string;
  change_24h: number | string | null;
  change_24h_pct: number | string | null;
};

type PosRow = {
  timestamp: string;
  source: string;
  position_key: string;
  asset_symbol: string;
  amount: number | string | null;
  value_usdt: number | string | null;
  chain: string;
  category: string;
  meta: any;
};

function n(v: any): number | null {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function fmtUsd(v: any, digits = 2) {
  const x = n(v);
  if (x == null) return "—";
  return x.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPct(v: any, digits = 2) {
  const x = n(v);
  if (x == null) return "—";
  return `${x.toFixed(digits)}%`;
}

function fmtTs(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default async function Home() {
  // 1) Latest NAV
  const { data: navData, error: navErr } = await supabase
    .from("nav_snapshots")
    .select("timestamp,total_nav,change_24h,change_24h_pct")
    .order("timestamp", { ascending: false })
    .limit(1);

  if (navErr) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8">
        <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow">
          <h1 className="text-xl font-semibold">MoneyFlow</h1>
          <p className="mt-4 text-red-600">Failed to load nav_snapshots: {navErr.message}</p>
        </div>
      </div>
    );
  }

  const nav = (navData?.[0] as NavRow) ?? null;
  const navTs = nav?.timestamp ?? null;
  const totalNav = n(nav?.total_nav) ?? null;
  const change24 = n(nav?.change_24h);
  const change24Pct = n(nav?.change_24h_pct);

  const isUp = change24 != null ? change24 >= 0 : null;

  // 2) Latest positions by latest timestamp
  let posRows: PosRow[] = [];

  if (navTs) {
    const { data: posData, error: posErr } = await supabase
      .from("position_snapshots")
      .select("timestamp,source,position_key,asset_symbol,amount,value_usdt,chain,category,meta")
      .eq("timestamp", navTs)
      .order("category", { ascending: true })
      .order("value_usdt", { ascending: false });

    if (posErr) {
      return (
        <div className="min-h-screen bg-zinc-50 p-8">
          <div className="mx-auto max-w-4xl rounded-2xl bg-white p-6 shadow">
            <h1 className="text-xl font-semibold">MoneyFlow</h1>
            <p className="mt-4 text-red-600">Failed to load position_snapshots: {posErr.message}</p>
          </div>
        </div>
      );
    }
    posRows = (posData as PosRow[]) ?? [];
  }

  // group totals
  const walletTotal = posRows.filter((p) => p.category === "wallet").reduce((a, p) => a + (n(p.value_usdt) ?? 0), 0);
  const cexTotal = posRows.filter((p) => p.category === "cex").reduce((a, p) => a + (n(p.value_usdt) ?? 0), 0);
  const defiTotal = posRows.filter((p) => p.category === "defi").reduce((a, p) => a + (n(p.value_usdt) ?? 0), 0);

  return (
    <div className="min-h-screen bg-zinc-50 p-6 text-zinc-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">MoneyFlow Dashboard</h1>
            <p className="text-sm text-zinc-500">Last update: {navTs ? fmtTs(navTs) : "—"}</p>
          </div>
        </header>

        {/* Top cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow">
            <div className="text-sm text-zinc-500">Total NAV</div>
            <div className="mt-2 text-3xl font-semibold">${fmtUsd(totalNav, 2)}</div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow">
            <div className="text-sm text-zinc-500">PnL (latest diff)</div>
            <div
              className={[
                "mt-2 text-3xl font-semibold",
                isUp == null ? "text-zinc-900" : isUp ? "text-emerald-600" : "text-rose-600",
              ].join(" ")}
            >
              {change24 == null ? "—" : `${change24 >= 0 ? "+" : ""}$${fmtUsd(change24, 4)}`}
            </div>
            <div className="mt-1 text-sm text-zinc-500">{fmtPct(change24Pct, 4)}</div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow">
            <div className="text-sm text-zinc-500">Allocation</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-600">Wallet</span>
                <span className="font-medium">${fmtUsd(walletTotal, 2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-600">CEX (OKX)</span>
                <span className="font-medium">${fmtUsd(cexTotal, 6)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-600">DeFi</span>
                <span className="font-medium">${fmtUsd(defiTotal, 2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Positions */}
        <div className="rounded-2xl bg-white p-5 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Positions</h2>
            <div className="text-xs text-zinc-500">{posRows.length} rows</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-zinc-500">
                <tr>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Source</th>
                  <th className="py-2 pr-4">Asset</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Value (USDT)</th>
                  <th className="py-2 pr-4">Chain</th>
                </tr>
              </thead>
              <tbody>
                {posRows.map((p) => (
                  <tr key={p.position_key} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">{p.category}</td>
                    <td className="py-2 pr-4">{p.source}</td>
                    <td className="py-2 pr-4 font-medium">{p.asset_symbol}</td>
                    <td className="py-2 pr-4">{p.amount == null ? "—" : n(p.amount)?.toLocaleString(undefined, { maximumFractionDigits: 10 })}</td>
                    <td className="py-2 pr-4">${fmtUsd(p.value_usdt, 6)}</td>
                    <td className="py-2 pr-4">{p.chain}</td>
                  </tr>
                ))}
                {posRows.length === 0 && (
                  <tr>
                    <td className="py-6 text-zinc-500" colSpan={6}>
                      No positions yet. Run backend snapshot.js to write snapshots.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-zinc-500">
            Note: “PnL (latest diff)” currently uses previous snapshot as baseline until you have 24h history.
          </p>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';

type Payout = {
  id: string;
  investor_email: string;
  amount: number;
  currency: string;
  status: 'UNPAID' | 'PAID';
  created_at: string;
};

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function AdminPayoutsPage() {
  const [txHash, setTxHash] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const payouts = useMemo<Payout[]>(
    () => [
      {
        id: 'po_100',
        investor_email: 'demo@moneyflow.local',
        amount: 100,
        currency: 'USDT',
        status: 'UNPAID',
        created_at: '2026-02-05 14:00',
      },
      {
        id: 'po_200',
        investor_email: 'alice@example.com',
        amount: 250,
        currency: 'USDT',
        status: 'UNPAID',
        created_at: '2026-02-05 16:00',
      },
      {
        id: 'po_001',
        investor_email: 'bob@example.com',
        amount: 150,
        currency: 'USDT',
        status: 'PAID',
        created_at: '2026-02-01 12:00',
      },
    ],
    []
  );

  function markPaid(id: string) {
    const h = (txHash[id] ?? '').trim();
    setMsg(` w аO ${id}    PAID ]mock ^${h ? ` Atx=${h}` : ''}`);
  }

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Admin  P Payouts</h1>
            <p className="mt-2 text-sm text-white/60">
               C X UNPAID  ݥX   F A     b    Mark as PAID C ] ثe   mock UI ^
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
               ^   Dashboard
            </Link>
            <Link
              href="/investors"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              Investor Portal
            </Link>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
          {msg ? (
            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {msg}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-white/60">
                <tr>
                  <th className="py-2"> ɶ </th>
                  <th className="py-2">   H</th>
                  <th className="py-2">   B</th>
                  <th className="py-2">   A</th>
                  <th className="py-2">Tx Hash ] i  ^</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className="border-t border-white/10">
                    <td className="py-2 text-white/80">{p.created_at}</td>
                    <td className="py-2">{p.investor_email}</td>
                    <td className="py-2">
                      {fmt(p.amount)} {p.currency}
                    </td>
                    <td className="py-2">
                      <span className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs">
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2">
                      <input
                        className="w-64 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs outline-none focus:border-white/30"
                        value={txHash[p.id] ?? ''}
                        onChange={(e) =>
                          setTxHash((m) => ({ ...m, [p.id]: e.target.value }))
                        }
                        placeholder="optional"
                        disabled={p.status === 'PAID'}
                      />
                    </td>
                    <td className="py-2 text-right">
                      {p.status === 'UNPAID' ? (
                        <button
                          onClick={() => markPaid(p.id)}
                          className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-white/90"
                        >
                          Mark as PAID
                        </button>
                      ) : (
                        <span className="text-xs text-white/40"> X</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 text-xs text-white/40">
             U @ B G  o   令Ū Supabase payouts ]UNPAID ^ A åB    u   admin   ݡC
          </div>
        </div>
      </div>
    </main>
  );
}

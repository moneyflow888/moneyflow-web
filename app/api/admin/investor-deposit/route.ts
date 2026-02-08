import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function requireAdminCookie() {
  const c = await cookies(); // ✅ Next.js 16: cookies() is async
  const v = c.get("mf_admin")?.value;
  if (v !== "1") throw new Error("Unauthorized");
}

export async function POST(req: Request) {
  try {
    await requireAdminCookie();
    const supabase = supabaseAdmin();

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const user_id = String(body?.user_id ?? "");
    const amount = Number(body?.amount ?? 0);
    const note = body?.note ? String(body.note) : null;

    if (!user_id) {
      return NextResponse.json({ error: "user_id required" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
    }

    // 確認帳戶存在
    const { data: acct, error: acctErr } = await supabase
      .from("investor_accounts")
      .select("user_id, principal, shares")
      .eq("user_id", user_id)
      .maybeSingle();
    if (acctErr) throw acctErr;
    if (!acct) {
      return NextResponse.json({ error: "investor account not found" }, { status: 404 });
    }

    const nowIso = new Date().toISOString();

    // ✅ 1) 先加 principal（只記帳，不鑄造 shares）
    const newPrincipal = Number(acct.principal ?? 0) + amount;

    const { error: updErr } = await supabase
      .from("investor_accounts")
      .update({
        principal: newPrincipal,
        updated_at: nowIso,
      })
      .eq("user_id", user_id);
    if (updErr) throw updErr;

    // ✅ 2) 寫入入金請求（待結算）
    const { data: reqRow, error: insErr } = await supabase
      .from("investor_deposit_requests")
      .insert({
        user_id,
        amount,
        status: "PENDING",
        note,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id, user_id, amount, status, created_at")
      .maybeSingle();
    if (insErr) throw insErr;

    return NextResponse.json({
      ok: true,
      mode: "principal_only",
      deposit_request: reqRow,
      user_id,
      amount,
      new_principal: newPrincipal,
      shares_unchanged: Number(acct.shares ?? 0),
    });
  } catch (e: any) {
    const msg = e?.message ?? "error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

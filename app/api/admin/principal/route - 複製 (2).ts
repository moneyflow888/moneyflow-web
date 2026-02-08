import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function requireAdminCookie() {
  const c = await cookies(); // ✅ Next.js 16: async
  const v = c.get("mf_admin")?.value;
  if (v !== "1") throw new Error("Unauthorized");
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Use POST to create principal adjustment.",
  });
}

export async function POST(req: Request) {
  try {
    await requireAdminCookie();

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const month = String(body.month || "").slice(0, 7);
    const delta = Number(body.delta);
    const note = body.note == null ? null : String(body.note);

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
    }
    if (!Number.isFinite(delta) || delta === 0) {
      return NextResponse.json({ error: "delta must be a non-zero number" }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("principal_adjustments")
      .insert([{ month, delta, note }])
      .select("id, month, delta, note, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, row: data });
  } catch (e: any) {
    const msg = e?.message ?? "error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

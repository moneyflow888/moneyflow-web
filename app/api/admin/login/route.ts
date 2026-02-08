import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  // ✅ 小延遲：降低暴力猜 token 效率（不需要外部套件）
  await sleep(350);

  try {
    const expected = process.env.ADMIN_TOKEN || process.env.ADMIN_API_KEY;
    if (!expected) return jsonError("ADMIN_TOKEN not set", 500);

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "");

    // ✅ 不洩漏細節：缺 token / token 錯 都回同一個 Unauthorized
    if (!token || token !== expected) {
      return jsonError("Unauthorized", 401);
    }

    const res = NextResponse.json({ ok: true });

    const isProd = process.env.NODE_ENV === "production";
    res.cookies.set("mf_admin", "1", {
      httpOnly: true,
      secure: isProd,     // production 必須 true（https）
      sameSite: "strict", // 防 CSRF
      path: "/",
      maxAge: 60 * 60 * 12, // 12 小時（你可改）
    });

    return res;
  } catch {
    return jsonError("Unauthorized", 401);
  }
}

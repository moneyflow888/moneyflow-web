import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });

  const isProd = process.env.NODE_ENV === "production";

  // ✅ 清除 HttpOnly admin cookie
  res.cookies.set("mf_admin", "", {
    httpOnly: true,
    secure: isProd,      // 與 login 一致
    sameSite: "strict",  // 與 login 一致
    path: "/",
    maxAge: 0,           // 立即失效
  });

  return res;
}

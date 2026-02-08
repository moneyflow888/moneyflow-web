import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const c = await cookies();
  const v = c.get("mf_admin")?.value;
  return NextResponse.json({ ok: true, is_admin: v === "1" });
}

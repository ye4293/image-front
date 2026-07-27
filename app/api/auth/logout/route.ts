import { NextResponse } from "next/server";
import { checkSameOrigin } from "@/lib/bff";
import { clearToken } from "@/lib/session";

export async function POST(req: Request) {
  // 登出也要挡跨站请求——否则攻击者可以强制登出受害者（骚扰级，但没有理由不挡）。
  const failure = checkSameOrigin(req);
  if (failure) {
    return NextResponse.json(failure.body, { status: failure.status });
  }

  await clearToken();
  return NextResponse.json({ ok: true });
}

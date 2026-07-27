import { NextResponse } from "next/server";
import { loginUser } from "@/lib/backend";
import { readCredentials, toClientError } from "@/lib/bff";
import { setToken } from "@/lib/session";

export async function POST(req: Request) {
  const creds = await readCredentials(req);
  if (!creds.ok) {
    return NextResponse.json(creds.failure.body, { status: creds.failure.status });
  }

  const res = await loginUser({ email: creds.email, password: creds.password });
  if (!res.ok) {
    const out = toClientError(res.error, res.status, "login");
    return NextResponse.json(out.body, { status: out.status });
  }
  await setToken(res.data.token);
  // token 只留在 httpOnly cookie 里，不回传给浏览器 JS
  return NextResponse.json({ ok: true });
}

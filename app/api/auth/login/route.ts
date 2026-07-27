import { NextResponse } from "next/server";
import { loginUser } from "@/lib/backend";
import { setToken } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json(
      { code: 40000, message: "email and password are required" },
      { status: 400 },
    );
  }

  const res = await loginUser({ email, password });
  if (!res.ok) {
    return NextResponse.json(res.error, { status: res.status });
  }
  await setToken(res.data.token);
  // token 只留在 httpOnly cookie 里，不回传给浏览器 JS
  return NextResponse.json({ ok: true });
}

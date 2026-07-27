import { NextResponse } from "next/server";
import { registerUser } from "@/lib/backend";

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

  const res = await registerUser({ email, password });
  if (!res.ok) {
    return NextResponse.json(res.error, { status: res.status });
  }
  return NextResponse.json(res.data, { status: 201 });
}

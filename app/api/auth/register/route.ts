import { NextResponse } from "next/server";
import { registerUser } from "@/lib/backend";
import { readCredentials, toClientError } from "@/lib/bff";

export async function POST(req: Request) {
  const creds = await readCredentials(req);
  if (!creds.ok) {
    return NextResponse.json(creds.failure.body, { status: creds.failure.status });
  }

  const res = await registerUser({ email: creds.email, password: creds.password });
  if (!res.ok) {
    const out = toClientError(res.error, res.status, "register");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data, { status: 201 });
}

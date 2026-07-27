import { NextResponse } from "next/server";
import { clearToken } from "@/lib/session";

export async function POST() {
  await clearToken();
  return NextResponse.json({ ok: true });
}

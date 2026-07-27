import { NextResponse } from "next/server";
import { getBalance } from "@/lib/fixtures";

export async function GET() {
  return NextResponse.json(getBalance());
}

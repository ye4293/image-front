import { NextResponse } from "next/server";
import { MODELS } from "@/lib/fixtures";

export async function GET() {
  return NextResponse.json({ models: MODELS });
}

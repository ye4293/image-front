import { NextResponse } from "next/server";
import { ADDON_PACKS, PLANS } from "@/lib/fixtures";

export async function GET() {
  return NextResponse.json({ plans: PLANS, addonPacks: ADDON_PACKS });
}

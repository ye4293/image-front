import { NextResponse } from "next/server";
import { ADDON_PACKS, PLANS } from "@/lib/plans";

/**
 * 套餐与加量包是**本仓库唯一残留的假数据**（Stripe 未接入，后端既没有 plans 表也没有
 * 对应接口）。数据本体与"为什么还是假的"都写在 `lib/plans.ts`——定价页是 Server
 * Component，直接 import 那份常量，所以数据不能只活在本文件里，否则要存两份。
 */
export async function GET() {
  return NextResponse.json({ plans: PLANS, addonPacks: ADDON_PACKS });
}

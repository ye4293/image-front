import { NextResponse } from "next/server";
import { listPlans } from "@/lib/backend";
import { toClientError } from "@/lib/bff";

/**
 * 可订阅档位，转交后端 `GET /api/v1/plans`。
 *
 * **公开接口，不取 token**：未登录访客也要能看定价页。后端只返回 `enabled` 的行、
 * 按 `sort_order` 升序，且响应里刻意没有 Stripe Price ID——前端下单只传 planId。
 *
 * 只读，故不过同源守卫（`checkSameOrigin` 防的是 CSRF，只有写操作才需要），
 * 同 `app/api/credits/route.ts`。
 *
 * 本路由留给**客户端**调用方（例如将来在弹窗里现取档位）。定价页本身是 Server
 * Component，直接调 `listPlans()`——从 RSC 里 fetch 自己的 Route Handler 要拼绝对
 * URL、多绕一跳网络，换不到任何好处。
 *
 * 加量包**不在这里**：后端没有 addon_packs 表也没有对应接口（M4b）。以前本路由
 * 顺带返回 `addonPacks`，那份数据是写死在 `lib/plans.ts` 里的假数据，已随该文件
 * 一起删除——回一个买不到的价目表比不回更糟。
 */
export async function GET() {
  const res = await listPlans();
  if (!res.ok) {
    const out = toClientError(res.error, res.status, "plans");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data, { status: 200 });
}

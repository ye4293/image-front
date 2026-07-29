import { NextResponse } from "next/server";
import { ERR_FORBIDDEN, createPortal } from "@/lib/backend";
import { checkSameOrigin, toClientError } from "@/lib/bff";
import { getToken } from "@/lib/session";

/**
 * 打开 Stripe Billing Portal（换卡 / 取消 / 看发票）：转交后端
 * `POST /api/v1/billing/portal`，回 `{ portalUrl }`。
 *
 * 是 POST 而不是 GET，尽管它"只是拿一个链接"：调用它会在 Stripe 侧创建一个
 * 一次性会话。做成 GET 就意味着预取、爬虫、`<img src>` 都能凭 cookie 触发创建，
 * 而且**没有 CSRF 守卫的位置**（GET 不该被同源检查挡）。POST + `checkSameOrigin`
 * 是这里的正解：Portal 会话能改支付方式、能取消订阅，替用户偷偷打开它是有实害的。
 *
 * 无请求体：要开谁的账单中心完全由 token 决定，绝不接受客户端传 customer id。
 */
export async function POST(req: Request) {
  const forbidden = checkSameOrigin(req);
  if (forbidden) {
    return NextResponse.json(forbidden.body, { status: forbidden.status });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ code: ERR_FORBIDDEN, message: "not signed in" }, { status: 401 });
  }

  const res = await createPortal(token);
  if (!res.ok) {
    // 40001 = 该用户还没有 Stripe customer（没结过账）。原样透传，前端给的是
    // "先去订阅"而不是"出错了"——注意这个码在 /generations 上是余额不足，
    // 解释它必须结合接口，见 lib/billing-errors.ts。
    const out = toClientError(res.error, res.status, "billing:portal");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data, { status: 200 });
}

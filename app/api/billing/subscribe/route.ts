import { NextResponse } from "next/server";
import { ERR_BAD_REQUEST, ERR_FORBIDDEN, createCheckout } from "@/lib/backend";
import { checkSameOrigin, toClientError } from "@/lib/bff";
import { getToken } from "@/lib/session";

/**
 * 发起订阅：转交后端 `POST /api/v1/billing/subscribe`，回 `{ checkoutUrl }`，
 * 由浏览器自己跳过去。
 *
 * **`checkSameOrigin` 在这里不是样板代码，是必需的。** 这是一个写操作：少了同源
 * 守卫，任意站点上一个 `<form enctype="text/plain" action="https://我们/api/billing/subscribe">`
 * 就能带着用户的 httpOnly cookie 替他发起结账（CORS 简单请求，无预检；`sameSite:
 * "lax"` 管不了这种顶层导航式提交）。理由细节见 `lib/bff.ts` 里 `checkSameOrigin`
 * 的注释。
 *
 * **未登录一律 401，绝不放行。** 未登录状态下开出的 Checkout 会话没有可归属的用户，
 * 用户付完款我们不知道该给谁发次数——这类工单只能人工退款收场。前端在按钮上也挡了
 * 一道（先跳登录），但那是体验，这里才是保证。
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

  // `req.json()` 返回 any，直接当对象用的话一个拼错的 `body?.plan` 也能过编译并
  // 静默退化。声明 unknown 再显式收窄，同 app/api/generations/route.ts。
  const body: unknown = await req.json().catch(() => null);
  const fields = (typeof body === "object" && body !== null ? body : {}) as { planId?: unknown };
  const planId = typeof fields.planId === "string" ? fields.planId.trim() : "";

  if (!planId) {
    return NextResponse.json(
      { code: ERR_BAD_REQUEST, message: "planId is required" },
      { status: 400 },
    );
  }

  // planId **不在这里查表**：档位活在后端 `plans` 表里，前端存一份副本必然漂移
  // （运营下架一档，副本不会知道）。未知或已下架的档位由后端回 40000。
  const res = await createCheckout(token, planId);
  if (!res.ok) {
    // 50300（未配 Stripe）与 50301（该档还没建 Price）原样透传：它们不是基础设施
    // 故障码，`toClientError` 不会改写，前端按码给可区分的文案。
    const out = toClientError(res.error, res.status, "billing:subscribe");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data, { status: 200 });
}

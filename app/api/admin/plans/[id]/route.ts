import { NextResponse } from "next/server";
import { ERR_BAD_REQUEST, ERR_FORBIDDEN, patchAdminPlan } from "@/lib/backend";
import { checkSameOrigin, toClientError } from "@/lib/bff";
import { getToken } from "@/lib/session";

/**
 * 改一个档位。**必须过** CSRF 同源守卫：它写的是每月发多少次数，被 CSRF 改成一个
 * 极大值等于免费送额度；改成 0 等于让所有付费用户下个月拿不到东西。
 *
 * body 原样转发，不补字段——后端按"传了才改"处理，补全会把没动过的字段一起覆盖。
 * 后端会显式拒绝 priceUsdCents / stripePriceID（Stripe 的 Price 金额不可变），
 * 那个 400 会带着说明原路返回，不做静默过滤。
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const forbidden = checkSameOrigin(req);
  if (forbidden) return NextResponse.json(forbidden.body, { status: forbidden.status });

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ code: ERR_FORBIDDEN, message: "not signed in" }, { status: 401 });
  }

  const body: unknown = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { code: ERR_BAD_REQUEST, message: "request body must be a JSON object" },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  const res = await patchAdminPlan(token, id, body as Record<string, unknown>);
  if (!res.ok) {
    const out = toClientError(res.error, res.status, "admin/plans[PATCH]");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data);
}

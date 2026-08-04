import { NextResponse } from "next/server";
import { ERR_BAD_REQUEST, ERR_FORBIDDEN, patchAdminUser } from "@/lib/backend";
import { checkSameOrigin, toClientError } from "@/lib/bff";
import { getToken } from "@/lib/session";

/**
 * 改一个用户的角色或状态。**必须过** CSRF 同源守卫。
 *
 * 这是本组接口里 CSRF 后果最严重的一个：被 CSRF 提权就等于攻击者拿到了整个后台
 * （改上游 key、改扣费、看全部用户邮箱）。封禁则能直接把真实用户挡在门外。
 *
 * 后端的两条防自锁守卫（不能改自己、不能把最后一个管理员降权）会回 400，
 * message 里说明了原因——原样透传，前端要显示出来，那是管理员诊断问题需要的。
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
  const numericID = Number(id);
  if (!Number.isInteger(numericID) || numericID <= 0) {
    return NextResponse.json({ code: ERR_BAD_REQUEST, message: "invalid user id" }, { status: 400 });
  }

  const res = await patchAdminUser(token, numericID, body as { role?: string; status?: string });
  if (!res.ok) {
    const out = toClientError(res.error, res.status, "admin/users[PATCH]");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data);
}

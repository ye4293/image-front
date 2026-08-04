import { NextResponse } from "next/server";
import { ERR_BAD_REQUEST, ERR_FORBIDDEN, patchAdminModel } from "@/lib/backend";
import { checkSameOrigin, toClientError } from "@/lib/bff";
import { getToken } from "@/lib/session";

/**
 * 改一个模型。**必须过** CSRF 同源守卫：它写的是每次生成扣多少次数，被 CSRF 改成 0
 * 会让后端的扣费路径拒绝（cost <= 0），该模型每次生成都失败；改成极大值则让用户
 * 一次生成就被扣光余额。
 *
 * provider 与 upstreamModel 由后端拒绝修改：generations 行按 id 引用模型，换掉上游
 * 会让事后对账把两批不同的结果混成同一个模型的。
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
  const res = await patchAdminModel(token, id, body as Record<string, unknown>);
  if (!res.ok) {
    const out = toClientError(res.error, res.status, "admin/models[PATCH]");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data);
}

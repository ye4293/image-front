import { NextResponse } from "next/server";
import { ERR_BAD_REQUEST, ERR_FORBIDDEN, grantCredits } from "@/lib/backend";
import { checkSameOrigin, toClientError } from "@/lib/bff";
import { getToken } from "@/lib/session";

/**
 * 给指定邮箱发额度。**必须过** CSRF 同源守卫——它直接发放可以换成图片的余额。
 *
 * ⚠️ 后端的 POST /admin/credits **没有幂等保护**：同一请求发两次就加两次额度
 * （流水的 ExternalID 留 nil，而 NULL 之间互不相等，唯一索引拦不住）。所以调用方
 * 必须在提交中禁用按钮，不能靠"用户不会连点"。
 */
export async function POST(req: Request) {
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

  const res = await grantCredits(token, body as { email: string; monthly?: number; addon?: number });
  if (!res.ok) {
    const out = toClientError(res.error, res.status, "admin/credits[POST]");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data ?? { ok: true });
}

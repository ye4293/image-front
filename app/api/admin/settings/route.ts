import { NextResponse } from "next/server";
import { ERR_BAD_REQUEST, ERR_FORBIDDEN, fetchAdminSettings, patchAdminSettings } from "@/lib/backend";
import { checkSameOrigin, toClientError } from "@/lib/bff";
import { getToken } from "@/lib/session";

/**
 * 后台设置读取。
 *
 * 只读，故**不过** CSRF 同源守卫（`checkSameOrigin` 防的是状态变更的 CSRF 攻击，
 * 读操作不改变服务端状态，无此风险。与 `app/api/credits/route.ts` 的判断一致）。
 *
 * 非管理员的 token 会被后端直接回 403，`toClientError` 会原样透传。
 */
export async function GET() {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ code: ERR_FORBIDDEN, message: "not signed in" }, { status: 401 });
  }

  const res = await fetchAdminSettings(token);
  if (!res.ok) {
    const out = toClientError(res.error, res.status, "admin/settings[GET]");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data);
}

/**
 * 后台设置更新。**必须过** CSRF 同源守卫。
 *
 * 写的是上游凭据（API key、R2 密钥）——若攻击者能 CSRF 这个接口，可将受害者（管理员）
 * 的 R2 存储改指自己的桶，之后所有新转存的图片都落入攻击者控制的存储。
 *
 * `lib/bff.ts` 详解了为什么 `SameSite=lax` cookie 策略在这里不够用：`req.json()` 根本
 * 不看 Content-Type，跨站的 `<form enctype="text/plain">` 是 CORS 简单请求（无预检），
 * 其 name=value 编码可以构造出合法 JSON，SameSite 挡不住它。
 *
 * body 原样转发给后端，不补字段。这是本文件最重要的不变量——见计划开头的陷阱一节：
 * 后端把 secret 的空字符串理解为"清空"，一旦自动填入未传的 key，每次保存都会把三个
 * secret 全部清空。调用方（settings-form.tsx）负责只在用户真的输了内容时才把 key 传入。
 */
export async function PATCH(req: Request) {
  const forbidden = checkSameOrigin(req);
  if (forbidden) {
    return NextResponse.json(forbidden.body, { status: forbidden.status });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ code: ERR_FORBIDDEN, message: "not signed in" }, { status: 401 });
  }

  // `req.json()` 返回 `any`：显式声明为 `unknown` 再收窄，同 generations/route.ts 的写法。
  const body: unknown = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { code: ERR_BAD_REQUEST, message: "request body must be a JSON object" },
      { status: 400 },
    );
  }

  // 原样转发，不补全任何 key。
  const res = await patchAdminSettings(token, body as Record<string, string>);
  if (!res.ok) {
    const out = toClientError(res.error, res.status, "admin/settings[PATCH]");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data);
}

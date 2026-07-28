import { NextResponse } from "next/server";
import { ERR_FORBIDDEN, fetchMe } from "@/lib/backend";
import { toClientError } from "@/lib/bff";
import { getToken } from "@/lib/session";

/**
 * 余额取自后端 `GET /api/v1/me` 的 `credits` 字段，**只回传那个字段**。
 *
 * 后端把余额并进了 `/me`（没有独立的余额接口），但这里刻意不把整个 `/me` 响应
 * 透出去：前端契约在 M2 就是 `{monthly, addon}`，保持不变，于是工作台的
 * `refreshBalance()` 与顶栏徽标一行都不用改。顺带也不会把 email/role 送给一个
 * 只想知道余额的调用方。
 *
 * 只读，故不过同源守卫（`checkSameOrigin` 防的是 CSRF，只有写操作才需要）。
 *
 * M2 时这里有一段"必须保持请求期求值，别让它变成可预渲染的"的警告——现在它读了
 * `cookies()`（`getToken()`），请求期求值由 cookie 读取本身保证，那个隐患消失了。
 */
export async function GET() {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ code: ERR_FORBIDDEN, message: "not signed in" }, { status: 401 });
  }

  const res = await fetchMe(token);
  if (!res.ok) {
    const out = toClientError(res.error, res.status, "credits");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data.credits);
}

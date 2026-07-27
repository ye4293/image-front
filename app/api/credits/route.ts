import { NextResponse } from "next/server";
import { getBalance } from "@/lib/fixtures";

/**
 * 只读，故不过同源守卫（`checkSameOrigin` 防的是 CSRF，只有写操作才需要）。
 *
 * **必须保持请求期求值，不要让它变成可预渲染的。** 本函数无参数、不碰任何
 * 请求期 API（`cookies()`、`headers()`、`req`），一旦有人开启 Next 16 的
 * `cacheComponents`，它就会成为预渲染候选：余额被冻结在构建期的 `{12,3}`，
 * 顶栏徽标永不更新。而 dev 模式永远不做静态优化，**本地根本测不出来**——
 * 只会在生产构建后表现为"点了生成余额不动"。若将来开启该特性，这里要显式
 * 加 `export const dynamic = "force-dynamic"` 或读一次请求期 API。
 */
export async function GET() {
  return NextResponse.json(getBalance());
}

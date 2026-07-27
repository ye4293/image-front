import { NextResponse } from "next/server";
import { checkSameOrigin } from "@/lib/bff";
import { resetBalance } from "@/lib/fixtures";

/**
 * 把内存余额恢复到初始值。**这是给端到端测试用的假数据专用接口**，
 * 接入真实后端时随 `lib/fixtures.ts` 一起整体删除。
 *
 * 为什么需要它：余额是进程级模块状态且没有任何重置路径，而 Playwright 复用
 * 已有 dev server。场景 3 故意耗尽余额触发升级弹窗，于是第二次跑测试时场景 1
 * 会从被抽干的余额开始，拿到 402 而不是结果图。`e2e/global-setup.ts` 在套件
 * 开始前 POST 一次这里。
 *
 * 过同源守卫：它改变状态，因此和 `/api/generations` 一样是 CSRF 目标。
 */
export async function POST(req: Request) {
  const forbidden = checkSameOrigin(req);
  if (forbidden) {
    return NextResponse.json(forbidden.body, { status: forbidden.status });
  }

  return NextResponse.json(resetBalance());
}

/**
 * 套件开始前把假数据余额恢复到初始值。
 *
 * 必需的理由：余额活在 `lib/fixtures.ts` 的进程级模块状态里，而 `webServer` 会
 * 复用本地已在跑的 dev server。场景 3 故意耗尽余额来触发升级弹窗，如果不重置，
 * **第二次**运行时场景 1（正常出图 + 余额减少）会从被抽干的余额开始，直接拿到
 * 402 弹窗而不是结果图。`workers: 1` 只防同次运行内的竞争，防不住跨次残留。
 */
async function globalSetup() {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

  const res = await fetch(`${baseURL}/api/credits/reset`, {
    method: "POST",
    // 这个请求不是浏览器发的，没有该头也会走到守卫的第 3 条放行分支，
    // 但显式带上更清晰——读到这里的人不必去翻守卫的判定优先级。
    headers: { "Sec-Fetch-Site": "same-origin" },
  });

  if (!res.ok) {
    throw new Error(`重置余额失败：${res.status} ${await res.text()}`);
  }
}

export default globalSetup;

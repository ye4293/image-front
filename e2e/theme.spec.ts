import { expect, test } from "@playwright/test";

/**
 * Kumo 设计 token 的端到端覆盖。
 *
 * 刻意只走 `/login` 这类**公开页**：token 是全局的，验证它不需要登录态，
 * 而注册账号要真实后端发次数，把一条纯样式断言拖进业务链路不值得。
 *
 * 字体与字号用 getComputedStyle 断言**真实解析结果**而不是读 CSS 变量——
 * 改动前的 bug 恰恰是变量写了、但自引用导致解析失败，读变量读不出来。
 */

// 默认亮色，让 .dark 的断言可判定（防闪 script 在没有 localStorage 时
// 会回退到 prefers-color-scheme）。
test.use({ colorScheme: "light" });

test("正文字体解析到 Inter", async ({ page }) => {
  await page.goto("/login");
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family).toMatch(/Inter/);
});

test("基准字号为 Kumo 的 14px", async ({ page }) => {
  await page.goto("/login");
  const size = await page.evaluate(() => getComputedStyle(document.body).fontSize);
  expect(size).toBe("14px");
});

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

test("主按钮是蓝色而非近黑", async ({ page }) => {
  await page.goto("/login");
  // 顶栏那个 "Sign in" 是 role=link，这里取的是表单提交按钮，不会撞上。
  const submit = page.getByRole("button", { name: "Sign in" });
  const bg = await submit.evaluate((el) => {
    // Chrome 111+ 的 getComputedStyle 可能返回 lab()/oklch() 等原始格式，
    // 直接 match(/\d+/) 会把小数点两侧拆成多截。用 Canvas 强制归一化到 sRGB
    // 整数，三通道数字才能可靠比较，与浏览器格式无关。
    const color = getComputedStyle(el).backgroundColor;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${r},${g},${b})`;
  });
  const [r, , b] = bg.match(/\d+/g)!.map(Number);
  // 改动前是近黑 oklch(0.205 0 0)，三通道相等且都很小，两条都不满足。
  expect(b).toBeGreaterThan(r + 40);
  expect(b).toBeGreaterThan(120);
});

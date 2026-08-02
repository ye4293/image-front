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

/**
 * 把元素的背景色读成 sRGB 整数三元组。
 *
 * 不能直接 `getComputedStyle(el).backgroundColor.match(/\d+/g)`：Chrome 111+ 会原样
 * 返回 `lab()` / `oklch()`，正则会把 `48.3311` 拆成 48 和 3311，算出的通道值是垃圾，
 * 而垃圾值**可能恰好让断言通过**。画进 1×1 canvas 再读回则与浏览器的记法无关。
 *
 * 附带的安全性质：`fillStyle` 解析失败时会静默保留上一个值（默认黑），
 * 结果是三通道全 0——只会造成假红，不会造成假绿。
 */
async function bgChannels(locator: import("@playwright/test").Locator) {
  return locator.evaluate((el) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = getComputedStyle(el).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b };
  });
}

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
  const { r, b } = await bgChannels(page.getByRole("button", { name: "Sign in" }));
  // 改动前是近黑 oklch(0.205 0 0)，三通道相等且都很小，两条都不满足。
  expect(b).toBeGreaterThan(r + 40);
  expect(b).toBeGreaterThan(120);
});

test("切换按钮能进暗色，且刷新后保持", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  // 刷新后仍是暗色——这条守的是持久化，也顺带守住防闪 script 真的在跑。
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("暗色下页面底色真的变深", async ({ page }) => {
  await page.goto("/login");
  const light = await bgChannels(page.locator("body"));

  await page.getByTestId("theme-toggle").click();
  const dark = await bgChannels(page.locator("body"));

  // 亮色 canvas 接近白（三通道各 ~250），暗色 canvas 是 oklch(10% 0 0)（各 ~20）。
  // 用单通道比就够了，且比三通道求和更好读。
  expect(dark.r).toBeLessThan(light.r - 100);
});

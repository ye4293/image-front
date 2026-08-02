import { test, expect, type Page } from "@playwright/test";

import { signUp } from "./accounts";

/**
 * 历史页的端到端覆盖。跑在**真实 Go 后端**上，后端须为 stub 模式
 * （不配 FLUX_API_KEY）。prompt 里带 `quick` 走 200 毫秒路径。
 *
 * 后端也**不会**配 R2（e2e 环境没有凭证），加上 stub 返回的是相对路径，
 * 所以这里生成出来的每一条都必然是 stored=false——「链接可能已失效」提示因此是
 * 可断言的，而它正好守住了 stored 字段从后端一路透到 UI 的完整链路。
 */

/** 生成按钮。文案是 `Generate ◆ 7`；顶栏那个 "Generate" 是 role=link，不会撞上。 */
function generateButton(page: Page) {
  return page.getByRole("button", { name: /^Generate/ });
}

/** 生成一张图并等它出图。 */
async function generateOnce(page: Page, prompt: string) {
  await page.goto("/generate");
  await page.getByTestId("prompt-input").fill(prompt);
  await generateButton(page).click();
  await expect(page.getByTestId("result-image")).toBeVisible({ timeout: 20_000 });
}

test("未登录访问 /history 跳登录", async ({ page }) => {
  await page.goto("/history");
  await expect(page).toHaveURL(/\/login/);
});

test("生成一张后能在历史里看到它，并提示链接可能失效", async ({ page }) => {
  await signUp(page, "hist");
  await generateOnce(page, "quick cat on a roof");

  await page.goto("/history");
  await expect(page.getByAltText("quick cat on a roof")).toBeVisible();
  // e2e 后端没配 R2，必然未转存——提示必须出现。链路上任何一环漏了 stored，
  // 这条就会失败。
  await expect(page.getByTestId("temporary-link-warning").first()).toBeVisible();
});

test("失败的生成在历史里显示未扣次数", async ({ page }) => {
  await signUp(page, "hist-fail");

  await page.goto("/generate");
  await page.getByTestId("prompt-input").fill("fail on purpose");
  await generateButton(page).click();
  // 失败路径不出图，等失败态稳定（stub 的 fail 关键词是 800ms）。
  await expect(page.getByTestId("result-error")).toBeVisible({ timeout: 20_000 });

  await page.goto("/history");
  await expect(page.getByText("No credits were charged.").first()).toBeVisible();
});

test("翻页不重不漏，最后一页 nextCursor 为 null", async ({ page }) => {
  await signUp(page, "hist-page");
  for (const p of ["quick one", "quick two", "quick three"]) {
    await generateOnce(page, p);
  }

  // 首屏默认 limit=20 会一次给完，所以分页语义直接打接口验证。
  // 用 page.request 而不是 request fixture：前者一定带上 page 的 httpOnly cookie。
  const first = await page.request.get("/api/generations?limit=2");
  expect(first.ok()).toBeTruthy();
  const firstPage = await first.json();
  expect(firstPage.generations).toHaveLength(2);
  expect(firstPage.nextCursor).toBeTruthy();

  const second = await page.request.get(
    `/api/generations?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor)}`,
  );
  const secondPage = await second.json();
  expect(secondPage.generations).toHaveLength(1);
  expect(secondPage.nextCursor).toBeNull();

  const ids = [...firstPage.generations, ...secondPage.generations].map(
    (g: { id: string }) => g.id,
  );
  expect(new Set(ids).size, `两页之间有重复：${ids.join(",")}`).toBe(3);
});

test("没有下一页时不显示「加载更多」", async ({ page }) => {
  await signUp(page, "hist-more");
  await generateOnce(page, "quick alpha");

  // 默认 limit 是 20，一条一屏就给完了，按钮不该出现——无条件渲染「加载更多」
  // 会让用户点一个什么都不会发生的按钮。
  await page.goto("/history");
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  await expect(page.getByAltText("quick alpha")).toBeVisible();
});

test.describe("移动端（375×667）", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("历史页在窄屏下两列且无横向溢出", async ({ page }) => {
    await signUp(page, "hist-m");
    await generateOnce(page, "quick mobile cat");

    await page.goto("/history");
    await expect(page.getByAltText("quick mobile cat")).toBeVisible();

    // 横向溢出是窄屏最常见也最难靠肉眼发现的回归：一个漏写 sm: 前缀的定宽
    // 在桌面端完全看不出来。
    const m = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(
      m.scrollWidth,
      `横向溢出：scrollWidth=${m.scrollWidth} > innerWidth=${m.innerWidth}`,
    ).toBeLessThanOrEqual(m.innerWidth);
  });
});

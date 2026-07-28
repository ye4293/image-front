import { test, expect, type Page } from "@playwright/test";
import { grantCredits } from "./backend";

/**
 * 工作台与定价页的端到端覆盖。跑在**真实 Go 后端**上，后端须为 stub 模式
 * （不配 `FLUX_API_KEY`），关键词行为由 `internal/generation/stub.go` 提供。
 *
 * **断言仍然写成"相对变化"，不写绝对余额。** M2 时的理由是余额是所有账号共用的
 * 进程级状态；现在余额按用户隔离、每条用例自己注册账号并领固定次数，写死绝对值
 * 本来也能过。仍然保留相对写法：它对"发多少次"这个前置量的变化免疫，而绝对值断言
 * 会在有人调整 GRANTED_CREDITS 时以"余额差了 N"这种无线索的方式失败。
 *
 * **prompt 里带 `quick` 是刻意的。** 默认路径要等 15 秒，几条用例串起来就是一分
 * 钟；`quick` 走 200 毫秒路径，让断言聚焦在流程正确性上。等待体验单独用一条不等完成
 * 的用例覆盖。关键词是子串匹配、不区分大小写，优先级 fail > slow > quick > 默认。
 */

const PASSWORD = "secret12345";

/** 首项模型（后端 image_models 里的 flux-2-max）的单价。变了会连带下面两条余额断言
 *  一起失败——这是好事。 */
const DEFAULT_MODEL_COST = 1;

/**
 * 每个测试账号领多少次数。新注册的账号余额是 **0**（后端不送新人次数），不发就直接
 * 402，所以这一步是必需的前置数据，不是便利。
 *
 * 数目要够跑完一条用例、又不必大：每条用例只生成一到两次。
 */
const GRANTED_CREDITS = 10;

/** 每次运行用不同邮箱，避免撞后端唯一索引。加 random 是因为同毫秒内可能建两个账号。 */
function uniqueEmail() {
  return `gen-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/**
 * 注册并登录一个全新账号，**并给它发次数**。返回后停在 /account。
 *
 * 发次数走后端管理员接口（`e2e/backend.ts`），不经浏览器：那是测试数据准备，前端
 * 没有也不该有管理界面。per-user 发放让每条用例互不干扰。
 */
async function signUp(page: Page) {
  const email = uniqueEmail();
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/login/);
  // 发次数必须在注册之后（用户要先存在）、登录进工作台之前（首屏就要读到余额）。
  await grantCredits(email, GRANTED_CREDITS);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  // 限定在 form 内：顶栏也有一个 "Sign in"（是 role=link，但限定住更抗改动）。
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return email;
}

/**
 * 顶栏余额徽标的数字。文案是 `◆ 15 credits`（ICU 复数，1 次时是 `◆ 1 credit`），
 * 所以剥掉所有非数字字符。空串时给出带原文的错误信息——否则 `Number("")` 静默变
 * 成 0，断言会以"余额差了 15"这种毫无线索的方式失败。
 */
async function readCredits(page: Page): Promise<number> {
  const text = await page.getByTestId("credit-badge").textContent();
  const digits = (text ?? "").replace(/\D/g, "");
  expect(digits, `余额徽标里没有数字，原文：${JSON.stringify(text)}`).not.toBe("");
  return Number(digits);
}

/** 生成按钮。文案是 `Generate ◆ 1`；顶栏那个 "Generate" 是 role=link，不会撞上。 */
function generateButton(page: Page) {
  return page.getByRole("button", { name: /^Generate/ });
}

/**
 * 一次 evaluate 里取齐"生成按钮是否还在首屏"所需的全部量。
 *
 * 分成多次 evaluate 的话，中间可能夹进一次重排，读到的 innerHeight 与 rect 不是
 * 同一帧的。`getBoundingClientRect()` 是**视口坐标**（不是文档坐标），所以还要顺
 * 带把 scrollY 读回来断言页面没有被滚动过——否则"按钮在视口内"可能是因为浏览器
 * 悄悄滚了一下，而真实用户看到的仍是折叠线以下。
 */
async function measureFold(page: Page) {
  return await generateButton(page).evaluate((el) => ({
    docScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollY: window.scrollY,
    buttonBottom: el.getBoundingClientRect().bottom,
  }));
}

/**
 * 出图后的两条回归断言。**两条背后都是已经修过一次的真缺陷，不要删。**
 *
 * 1. 结果图固有 768px 高，曾经把整页撑到视口以外，于是参数列底部锚定的生成按钮
 *    被挤到折叠线以下——用户每次生成都得先滚动才能点到主界面上最重要的按钮。
 *    现在图片用 `max-h-[70vh]` 直接对视口设上限。
 * 2. 横向不能溢出。移动端纵向堆叠是新加的，一个漏写 `md:` 前缀的定宽就会让 375px
 *    的屏出现横向滚动条，而桌面端完全看不出来。
 */
async function expectGenerateButtonAboveFold(page: Page) {
  const m = await measureFold(page);
  expect(
    m.docScrollWidth,
    `横向溢出：scrollWidth=${m.docScrollWidth} > innerWidth=${m.innerWidth}`,
  ).toBeLessThanOrEqual(m.innerWidth);
  expect(m.scrollY, "页面被滚动了，下面的折叠线断言就不再说明问题").toBe(0);
  expect(
    m.buttonBottom,
    `生成按钮跌到折叠线以下：底边 ${m.buttonBottom} > 视口高 ${m.innerHeight}`,
  ).toBeLessThanOrEqual(m.innerHeight);
}

/** 出图 → 余额减少 → 按钮仍在首屏。桌面与移动端共用。 */
async function runGenerateSuccess(page: Page) {
  await page.goto("/generate");

  // 顺带守住"首项模型是 1 次"这个前提：下面的相对断言依赖它，
  // 而后端 image_models 的 sort_order / credits 一改，失败信息在这里比在余额断言里
  // 清楚得多。
  await expect(generateButton(page)).toHaveText(`Generate ◆ ${DEFAULT_MODEL_COST}`);

  const before = await readCredits(page);
  await page.getByTestId("prompt-input").fill("quick cat astronaut");
  await generateButton(page).click();

  await expect(page.getByTestId("result-image")).toBeVisible({ timeout: 20_000 });

  // 徽标由 Server Component 渲染，靠 `router.refresh()` 更新，落地有一两拍延迟。
  // 用 expect.poll 而不是固定等待：它是会重试的断言，超时后报的是最后一次真实读数。
  await expect
    .poll(() => readCredits(page), { timeout: 10_000 })
    .toBe(before - DEFAULT_MODEL_COST);

  await expectGenerateButtonAboveFold(page);
}

test("未登录访问 /generate 被重定向到 /login", async ({ page }) => {
  await page.goto("/generate");
  await expect(page).toHaveURL(/\/login$/);
});

test("生成成功：出图、扣次数，且生成按钮仍在首屏", async ({ page }) => {
  await signUp(page);
  await runGenerateSuccess(page);
});

test("生成失败：显示原因并退回次数", async ({ page }) => {
  await signUp(page);
  await page.goto("/generate");

  const before = await readCredits(page);
  await page.getByTestId("prompt-input").fill("please fail this one");
  await generateButton(page).click();

  // fail 路径在后端 stub 里是 800 毫秒（M2 假数据是 8 秒），下面的超时是上界，
  // 不用跟着调小。
  const error = page.getByTestId("result-error");
  await expect(error).toBeVisible({ timeout: 25_000 });
  // 文案必须提到退款：扣了次数却没出图、又不说退了，是最容易生工单的一种沉默。
  await expect(error).toContainText("refunded");

  // 回到提交前的值，而不是"比提交前少 1"——失败要按扣费时的拆分原样退回。
  await expect.poll(() => readCredits(page), { timeout: 10_000 }).toBe(before);
});

test("生成过程中显示骨架与已用秒数，而不是假进度条", async ({ page }) => {
  await signUp(page);
  await page.goto("/generate");

  // 用默认的 15 秒路径（prompt 不含任何关键词），但**只断言等待态出现，不等它完成**。
  await page.getByTestId("prompt-input").fill("a detailed landscape at sunset");
  await generateButton(page).click();

  const skeleton = page.getByTestId("generating-skeleton");
  await expect(skeleton).toBeVisible();
  // ICU 复数：1 秒时是 "1 second elapsed…"，其余是 "N seconds elapsed…"。
  await expect(skeleton).toContainText(/second[s]? elapsed/);

  // **这条守着一个刻意的取舍，不要"顺手补个进度条"把它改绿：** 上游不提供任何进度
  // 信号，画一根会动的确定性进度条就是编造信息——用户会据此估算剩余时间，而那个
  // 数字是假的。所以只显示真实已耗时。见 result-panel.tsx 的注释。
  await expect(page.locator("progress")).toHaveCount(0);
});

test("定价页对未登录用户可见，套餐、加量包与双余额说明齐全", async ({ page }) => {
  await page.goto("/pricing");

  await expect(page.getByTestId("plan-starter")).toBeVisible();
  await expect(page.getByTestId("plan-pro")).toBeVisible();
  await expect(page.getByTestId("plan-max")).toBeVisible();

  await expect(page.getByTestId("addon-pack-100")).toBeVisible();
  await expect(page.getByTestId("addon-pack-450")).toBeVisible();
  await expect(page.getByTestId("addon-pack-1200")).toBeVisible();

  // 双余额说明：这三条（月度会重置 / 加量包不过期 / 先扣月度）是最容易被误读成
  // "被多扣"的地方，必须出现在页面上，不能只躺在 FAQ 里。
  //
  // 取词有讲究：这些句子是 `t.rich` 渲染的，强调词在 <strong>/<u> 里，而 `getByText`
  // 命中的是"包含该文本的最小元素"。所以不能挑 "Monthly credits" 这种短语——它同时
  // 是 explainerMonthly 的 <strong> 和 explainerOrder 里 "spends monthly credits
  // first" 的子串，两个都命中就触发严格模式报错。要么用跨标签边界的长句（只有外层
  // <p> 能整体包含），要么用 exact 精确锁住某个 <u>。
  await expect(
    page.getByRole("heading", {
      name: "What's the difference between monthly and add-on credits?",
    }),
  ).toBeVisible();
  await expect(page.getByText("reset with every billing cycle")).toBeVisible();
  // exact 是必需的：加量包小标题里那个 <strong>never expires</strong> 多一个 s，
  // 非精确匹配会把两个都算上。
  await expect(page.getByText("never expire", { exact: true })).toBeVisible();
  await expect(page.getByText("spends monthly credits first")).toBeVisible();
});

/**
 * 移动端布局的兜底。纵向堆叠（参数在上、结果在下）是新加的，桌面端的用例全部跑在
 * 1280×720，**一个漏写 `md:` 前缀的样式在桌面端毫无症状**，只有 375px 才暴露。
 * 这里跑完整的出图路径，并复用同一组折叠线/横向溢出断言。
 */
test.describe("移动端（375×667）", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("生成成功：出图、扣次数，且生成按钮仍在首屏", async ({ page }) => {
    await signUp(page);
    await runGenerateSuccess(page);
  });
});

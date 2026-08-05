import { expect, test, type Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./backend";
import { signUp } from "./accounts";

/**
 * 三个新后台页面（档位／模型／用户）的端到端验收。
 *
 * 每个页面三段，与 admin-settings.spec.ts 同一结构：
 *   1. 管理员能看到并能改
 *   2. **非管理员看不到任何数据**——断言字段数为 0，而不是只断言有 forbidden 文案。
 *      只断言文案的话，一个"既渲染了提示又渲染了表格"的实现会假绿。
 *   3. 375×667 移动端：关键元素可见、输入框够宽、无横向溢出
 *
 * 鉴权集中在 app/[locale]/admin/layout.tsx，所以第 2 段其实是在验证那一处；
 * 但仍然逐页面写，因为"layout 覆盖到了这个页面"本身就是要被钉住的事实——
 * 新增页面时若放错目录，layout 就管不到它。
 */

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** 横向溢出守卫。窄屏最常见、也最难在桌面宽度下发现的回归。 */
async function expectNoHorizontalOverflow(page: Page) {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    m.scrollWidth,
    `横向溢出：scrollWidth=${m.scrollWidth} > innerWidth=${m.innerWidth}`,
  ).toBeLessThanOrEqual(m.innerWidth);
}

test.describe("后台档位页", () => {
  test("管理员能看到档位并修改每月次数", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/plans");

    // 三个档位都在。用 data-testid 而不是文案：文案是词条，改措辞会悄悄弄坏选择器。
    for (const id of ["starter", "pro", "max"]) {
      await expect(page.getByTestId(`plan-${id}`)).toBeVisible();
    }

    // 不可变字段的说明必须在页面上——只把输入框藏起来会让运营以为功能没做完，
    // 然后直接去改数据库，而那正是最坏的结果。
    await expect(page.getByText(/Stripe Price/i).first()).toBeVisible();

    // 改一个值并保存。取当前值 +1 再存回去，这样反复跑不会把数字越推越大到离谱。
    const input = page.locator("#starter-credits");
    const before = Number(await input.inputValue());
    await input.fill(String(before + 1));
    await page.getByTestId("plan-starter").getByRole("button", { name: /Save|保存/ }).click();
    await expect(page.getByTestId("plan-starter").getByText(/Saved|已保存/)).toBeVisible();

    // 刷新后必须还在——只看界面上的"已保存"不够，那只证明请求回了 200。
    await page.reload();
    await expect(page.locator("#starter-credits")).toHaveValue(String(before + 1));

    // 还原，保持这条用例幂等。
    await page.locator("#starter-credits").fill(String(before));
    await page.getByTestId("plan-starter").getByRole("button", { name: /Save|保存/ }).click();
    await expect(page.getByTestId("plan-starter").getByText(/Saved|已保存/)).toBeVisible();
  });

  test("清空次数输入框不会被静默存成 0", async ({ page }) => {
    // **这一条钉的是一个花真钱的静默失败。**
    //
    // `Number("")` 是 0，而 type=number 的输入框在内容非法时也返回空串。原先直接
    // `Number(d.monthlyCredits)` 的写法会把"清空再保存"变成 `monthlyCredits: 0`，
    // 而后端**接受** 0（0 是合法配置，意为该档暂时不发次数，见 admin_plans.go:77）。
    // 于是界面显示绿色"已保存"，这一档的付费用户从此一次额度都拿不到，
    // 而没有任何地方会报错。
    await signInAsAdmin(page);
    await page.goto("/admin/plans");

    // **自己建立前提，不依赖库里现有的值。** 这条用例要证明的是"清空之后库里的正数
    // 没被改成 0"，所以它必须先确保库里确实是个正数。依赖初始种子数据的话，任何
    // 一条先跑的用例（或一次手工调档）都能让它变成假红或假绿——而这个套件本身就
    // 有一条会改 starter 的用例。
    const input = page.locator("#starter-credits");
    const before = "123";
    await input.fill(before);
    await page.getByTestId("plan-starter").getByRole("button", { name: /Save|保存/ }).click();
    await expect(page.getByTestId("plan-starter").getByText(/Saved|已保存/)).toBeVisible();

    await input.fill("");
    await page.getByTestId("plan-starter").getByRole("button", { name: /Save|保存/ }).click();

    // 必须就地报错，且**不能**出现"已保存"。
    await expect(page.getByTestId("plan-starter").getByRole("alert")).toBeVisible();
    await expect(page.getByTestId("plan-starter").getByText(/Saved|已保存/)).toHaveCount(0);

    // 最关键的一条：刷新之后库里的值必须没变。
    // 只断言界面报了错是不够的——那不能排除"报错的同时请求已经发出去了"。
    await page.reload();
    await expect(page.locator("#starter-credits")).toHaveValue(before);
  });

  test("非管理员看不到任何档位数据", async ({ page }) => {
    await signUp(page, "plain-plans");
    await page.goto("/admin/plans");

    // **断言数据元素数量为 0**，而不是只断言有 forbidden 文案：一个既渲染提示
    // 又渲染表格的实现会让"只查文案"的断言假绿，而那就是信息泄露。
    await expect(page.getByTestId("plan-starter")).toHaveCount(0);
    await expect(page.getByTestId("plan-pro")).toHaveCount(0);
    await expect(page.locator("#starter-credits")).toHaveCount(0);
  });
});

test.describe("后台模型页", () => {
  test("管理员能看到模型并修改扣费", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/models");

    // 至少有一个模型（后端 seedModels 会播种）。
    const rows = page.locator('[data-testid^="model-"]');
    await expect(rows.first()).toBeVisible();

    // 扣费下限的提示必须在——credits=0 会让该模型每次生成都失败。
    await expect(page.getByText(/at least 1|必须 ≥ 1/i).first()).toBeVisible();
  });

  test("非管理员看不到任何模型数据", async ({ page }) => {
    await signUp(page, "plain-models");
    await page.goto("/admin/models");
    await expect(page.locator('[data-testid^="model-"]')).toHaveCount(0);
  });
});

test.describe("后台用户页", () => {
  test("管理员能搜索用户、看到余额", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/users");

    // 桌面视口下渲染的是表格形态。
    await expect(page.locator('[data-testid^="user-row-"]').first()).toBeVisible();

    // 搜索管理员自己的邮箱，必须能搜到。
    await page.locator("#user-search").fill(ADMIN_EMAIL);
    await page.getByRole("button", { name: /^(Search|搜索)$/ }).click();

    // **必须限定在表格行内断言。** 双形态渲染让同一个邮箱在 DOM 里出现两次
    // （手机卡片 + 桌面表格），而卡片那份排在前面且被 md:hidden 隐藏——
    // 裸的 getByText(...).first() 会匹配到那个隐藏元素然后超时，
    // 报"看不到邮箱"，把人指向搜索功能，而搜索其实是好的。
    const rows = page.locator('[data-testid^="user-row-"]');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(ADMIN_EMAIL);
  });

  test("管理员不能封禁自己——按钮点得下去，但后端拒绝并说明原因", async ({ page }) => {
    // 这是**防自锁守卫**的端到端验收。把自己封了就再也进不了后台，只能连数据库
    // 恢复，所以后端会拒绝，而前端必须把拒绝的原因显示出来——否则管理员会反复点、
    // 以为是页面坏了。
    await signInAsAdmin(page);
    await page.goto("/admin/users");
    await page.locator("#user-search").fill(ADMIN_EMAIL);
    await page.getByRole("button", { name: /^(Search|搜索)$/ }).click();

    const row = page.locator('[data-testid^="user-row-"]').first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /Ban|封禁/ }).click();
    await row.getByRole("button", { name: /Confirm|确认/ }).click();

    // 后端的 message 原样显示。断言 role="alert" 而不是具体措辞：那句话来自后端、
    // 是中文的，而这条测试跑在英文界面下。
    await expect(row.locator('[role="alert"]')).toBeVisible();

    // 而且**确实没被封**——刷新后仍能进后台。
    await page.reload();
    await expect(page.locator('[data-testid^="user-row-"]').first()).toBeVisible();
  });

  test("发完额度后列表里的余额立刻更新", async ({ page, context }) => {
    // **这一条钉的也是一个花真钱的失败，只是路径绕一点。**
    //
    // POST /admin/credits 没有幂等保护（流水的 ExternalID 留 nil，而 NULL 之间互不
    // 相等，唯一索引拦不住）。发完之后列表里的余额若还是旧数字，管理员会以为没生效
    // 而**再发一次**——那一次会真的再加一遍。所以"发完就刷新"不是体验问题。
    //
    // 用一个独立的浏览器上下文注册目标用户，免得把管理员的登录态挤掉。
    const victimPage = await context.browser()!.newPage();
    const email = await signUp(victimPage, "grant-refresh");
    await victimPage.close();

    await signInAsAdmin(page);
    await page.goto("/admin/users");

    // 搜到这个用户，记下当前余额。
    await page.locator("#user-search").fill(email);
    await page.getByRole("button", { name: /^(Search|搜索)$/ }).click();
    const row = page.locator('[data-testid^="user-row-"]').first();
    await expect(row).toContainText(email);
    const before = (await row.textContent()) ?? "";

    // 发 7 次月度额度。数字取一个不会和别处撞的值，方便在文本里认出来。
    await page.locator("#grant-email").fill(email);
    await page.locator("#grant-monthly").fill("7");
    await page.getByRole("button", { name: /^(Grant|发放)$/ }).click();

    // 列表必须自己刷新——**不刷新页面**。这里断言的正是"不用手动刷新"。
    await expect(page.locator('[data-testid^="user-row-"]').first()).not.toHaveText(before, {
      timeout: 5000,
    });

    // 邮箱输入框也要清空：留着它 + 余额没变 = 一个"再点一次提交"的邀请。
    await expect(page.locator("#grant-email")).toHaveValue("");
  });

  test("非管理员看不到任何用户数据", async ({ page }) => {
    await signUp(page, "plain-users");
    await page.goto("/admin/users");

    // 用户列表泄露的是全站邮箱，这一条是本文件里最重要的信息泄露断言。
    await expect(page.locator('[data-testid^="user-row-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="user-card-"]')).toHaveCount(0);
    await expect(page.locator("#user-search")).toHaveCount(0);
    // 也不能出现任何邮箱。
    await expect(page.getByText(ADMIN_EMAIL)).toHaveCount(0);
  });
});

test.describe("移动端（375×667）", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("档位页在窄屏下可用且无横向溢出", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/plans");

    await expect(page.getByTestId("plan-starter")).toBeVisible();
    // 输入框要够宽才能打字。被挤到 40px 的输入框等于不能用。
    const box = await page.locator("#starter-credits").boundingBox();
    expect(box, "每月次数输入框没有布局盒").not.toBeNull();
    expect(box!.width, `输入框只有 ${box!.width}px 宽，窄到没法输入`).toBeGreaterThan(150);
    await expectNoHorizontalOverflow(page);
  });

  test("模型页在窄屏下可用且无横向溢出", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/models");
    await expect(page.locator('[data-testid^="model-"]').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("用户页在窄屏下切成卡片形态且无横向溢出", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/users");

    // **窄屏必须是卡片形态而不是表格。** 单表格加横向滚动的话，操作列要横着拖
    // 才看得到——而那恰好是最需要点的一列。
    await expect(page.locator('[data-testid^="user-card-"]').first()).toBeVisible();
    await expect(page.locator('[data-testid^="user-row-"]').first()).toBeHidden();

    // 操作按钮必须可见、可点。
    const card = page.locator('[data-testid^="user-card-"]').first();
    await expect(card.getByRole("button").first()).toBeVisible();

    // 邮箱可能很长，卡片里用了 break-all——这一条守住它没被漏掉。
    await expectNoHorizontalOverflow(page);
  });
});

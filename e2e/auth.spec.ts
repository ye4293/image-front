import { test, expect } from "@playwright/test";

/** 每次运行用不同邮箱，避免撞后端唯一索引 */
function uniqueEmail() {
  return `e2e-${process.pid}-${test.info().parallelIndex}-${Date.now()}@example.com`;
}

const PASSWORD = "secret12345";

test("未登录访问 /account 被重定向到 /login", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
});

test("注册 → 登录 → 账户页 → 登出 全流程", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await expect(page.getByText("Account created. Please sign in.")).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  // 限定在 form 内：顶栏也有一个 "Sign in"。顶栏那个现在是 role=link（见下方断言），
  // 所以严格说不限定也能唯一命中，但限定住更抗改动。
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId("account-email")).toHaveText(email);
  await expect(page.getByTestId("account-role")).toHaveText("user");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
  // 断言 role=link 而非 button，是在守住一个无障碍修复：顶栏导航项曾经用
  // <Button nativeButton={false} render={<Link/>}> 渲染，Base UI 会强制写上
  // role="button"，导致会跳页的链接被播报成按钮。改用 buttonVariants 上样式后
  // 语义恢复成真链接。这条断言会在有人改回去时立刻失败。
  await expect(page.locator("header").getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("重复邮箱注册显示后端错误文案", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  // 限定在 form 内：Next 自己注入的 __next-route-announcer__ 也带 role="alert"，
  // 不限定范围会命中两个元素，触发严格模式报错。
  await expect(page.locator("form").getByRole("alert")).toHaveText("email already registered");
});

test("密码错误显示后端错误文案", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("totallywrong1");
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  // 限定范围的理由同「重复邮箱」那条测试。
  await expect(page.locator("form").getByRole("alert")).toHaveText("invalid email or password");
});

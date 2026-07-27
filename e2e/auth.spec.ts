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
  // Scope to form: the header nav link also renders role="button" "Sign in" (shadcn
  // Button with nativeButton={false} always uses role="button" regardless of element type),
  // so an unscoped query hits 2 elements and triggers strict mode.
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId("account-email")).toHaveText(email);
  await expect(page.getByTestId("account-role")).toHaveText("user");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
  // The SiteHeader Button with nativeButton={false} + render={<Link/>} renders as <a>
  // with role="button" (not role="link"); scope to header to avoid the body "Sign in" link.
  await expect(page.locator("header").getByRole("button", { name: "Sign in" })).toBeVisible();
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
  // Scope to form: Next.js's __next-route-announcer__ also carries role="alert",
  // causing a strict-mode violation on an unscoped query.
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
  // Same scoping rationale as the duplicate-email test.
  await expect(page.locator("form").getByRole("alert")).toHaveText("invalid email or password");
});

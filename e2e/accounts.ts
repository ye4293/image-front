import { expect, type Page } from "@playwright/test";
import { grantCredits } from "./backend";

export const PASSWORD = "secret12345";

/**
 * 每个测试账号领多少次数。新注册的账号余额是 **0**（后端不送新人次数），不发就直接
 * 402，所以这一步是必需的前置数据，不是便利。
 *
 * 数目要够跑完一条用例、又不必大：每条用例只生成一到两次。
 */
export const GRANTED_CREDITS = 30;

/** 每次运行用不同邮箱，避免撞后端唯一索引。加 random 是因为同毫秒内可能建两个账号。 */
export function uniqueEmail(prefix = "gen") {
  return `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/**
 * 注册并登录一个全新账号，**并给它发次数**。返回后停在 /account。
 *
 * 发次数走后端管理员接口（`e2e/backend.ts`），不经浏览器：那是测试数据准备，前端
 * 没有也不该有管理界面。per-user 发放让每条用例互不干扰。
 */
export async function signUp(page: Page, prefix = "gen") {
  const email = uniqueEmail(prefix);
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

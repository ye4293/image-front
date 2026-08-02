import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./accounts";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./backend";

/**
 * 管理员设置页端到端覆盖。
 *
 * **Admin login strategy:**
 * `ensureAdminToken()` in `global-setup.ts` registers ADMIN_EMAIL with
 * ADMIN_PASSWORD and verifies role === "admin" before any test runs.
 * Browser-side login in these tests reuses those same credentials — no need
 * to call `ensureAdminToken()` again per test.
 *
 * The backend seeds `fluxApiKey` = `sk-seed-secret-value` and
 * `r2Bucket` = `seed-bucket` from environment variables on first start;
 * those values are the ground truth for the assertions below.
 */

/** Sign in as admin through the browser login form. Lands at /account. */
async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** The eight setting field labels in English (default locale). */
const FIELD_LABELS = [
  "EzLinkAI Base URL",
  "Flux API Key",
  "R2 Endpoint",
  "R2 Access Key ID",
  "R2 Secret Access Key",
  "R2 Bucket",
  "R2 Public Base URL",
  "App Base URL",
] as const;

// ── Case 2 ────────────────────────────────────────────────────────────────────

test("未登录访问 /admin/settings 跳登录", async ({ page }) => {
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/login/);
});

// ── Case 1 ────────────────────────────────────────────────────────────────────

test("普通用户访问 /admin/settings 看到 forbidden 且无任何表单字段", async ({ page }) => {
  await signUp(page, "settings-nonadmin");
  await page.goto("/admin/settings");

  // The forbidden message must be visible.
  await expect(
    page.getByText("You do not have permission to view this page."),
  ).toBeVisible();

  // ── Information-disclosure guard ──────────────────────────────────────────
  // "Forbidden text is visible" alone does not prove the form is absent.
  // Assert each field label is NOT in the DOM so a non-admin cannot see
  // masks or configured-state, even if they appear below the message.
  for (const label of FIELD_LABELS) {
    await expect(
      page.getByLabel(label),
      `field "${label}" must not exist for a non-admin user`,
    ).toHaveCount(0);
  }
  // Configured / Not-configured status markers must not be present either.
  await expect(
    page.getByText("Configured", { exact: true }),
    "no 'Configured' markers should be visible to non-admin users",
  ).toHaveCount(0);
  await expect(
    page.getByText("Not configured", { exact: true }),
    "no 'Not configured' markers should be visible to non-admin users",
  ).toHaveCount(0);
});

// ── Case 3 ────────────────────────────────────────────────────────────────────

test("管理员看到八个字段；secret 字段显示配置状态而非明文", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/admin/settings");

  // All eight field inputs must be rendered.
  for (const label of FIELD_LABELS) {
    await expect(page.getByLabel(label), `field "${label}" must be visible`).toBeVisible();
  }

  // fluxApiKey is seeded → its "Configured" badge must be present.
  await expect(page.getByText("Configured", { exact: true }).first()).toBeVisible();

  // The seeded secret value must NEVER appear anywhere in the page HTML —
  // neither in input values, attributes, nor comments.
  const content = await page.content();
  expect(content, "seeded secret plaintext must not leak to the page").not.toContain(
    "sk-seed-secret-value",
  );
});

// ── Case 4 ────────────────────────────────────────────────────────────────────

test("管理员改 r2Bucket 并保存，成功提示后刷新新值仍在", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/admin/settings");

  // Use a unique value per run so the assertion is tied to THIS test's write.
  const newBucket = `e2e-bucket-${Date.now()}`;
  await page.getByLabel("R2 Bucket").fill(newBucket);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Reload the page (forces a fresh RSC fetch) and confirm persistence.
  await page.reload();
  await expect(page.getByLabel("R2 Bucket")).toHaveValue(newBucket);
});

// ── Case 5 — THE MOST IMPORTANT CASE ─────────────────────────────────────────

test("【关键】只改 r2Bucket 保存后 secret 仍然是已配置", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/admin/settings");

  // Count "Configured" badges before the save.
  // fluxApiKey is seeded, so at least one badge must exist before we start.
  const before = await page.getByText("Configured", { exact: true }).count();
  expect(before, "at least one secret must be configured before the save").toBeGreaterThan(0);

  // Edit only r2Bucket — a plain, non-secret field.
  await page.getByLabel("R2 Bucket").fill(`guard-test-${Date.now()}`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // After saving a plain field, ALL previously-configured secrets must still
  // show "Configured". If the form had submitted empty strings for the secret
  // inputs, the backend would treat them as "clear this secret" and the count
  // would drop. This guards the critical invariant described in the plan:
  // "secret 输入框为空 ⇒ 请求体里根本不带这个 key".
  const after = await page.getByText("Configured", { exact: true }).count();
  expect(
    after,
    `${before - after} secret(s) were cleared by the save — ` +
      "empty secret inputs must NOT be included in the PATCH body",
  ).toBe(before);
});

// ── Case 6 ────────────────────────────────────────────────────────────────────

test("r2PublicBaseUrl 填 S3 API 域名保存失败并显示后端报错原文", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/admin/settings");

  await page.getByLabel("R2 Public Base URL").fill("https://acct.r2.cloudflarestorage.com");
  await page.getByRole("button", { name: "Save" }).click();

  // The backend returns a Chinese validation message that mentions "S3 API 域名"
  // and "不允许匿名读" (anonymous reads are not allowed on the S3 API endpoint).
  // This page is the intentional exception to the pattern of hiding backend error
  // text from users — the audience is an admin who needs the exact validation
  // message to diagnose misconfiguration.
  await expect(
    page.getByText(/S3 API|不允许匿名读|r2\.dev/),
    "backend domain-validation message must be shown verbatim in the form",
  ).toBeVisible();

  // The success badge must not appear alongside the error.
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
});

// ── Case 7 — Mobile ───────────────────────────────────────────────────────────

test.describe("移动端（375×667）", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("管理员设置表单在窄屏下可用且无横向溢出", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/settings");

    // The form must load — wait for a representative field.
    await expect(page.getByLabel("R2 Bucket")).toBeVisible();
    // The save button must be in the DOM and visible (not clipped).
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();

    // Horizontal overflow is the most common narrow-screen regression and the
    // hardest to catch at desktop width. One un-prefixed fixed-width child is
    // enough to break the whole page.
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

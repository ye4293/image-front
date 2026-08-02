import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./accounts";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./backend";

/**
 * 管理员设置页端到端覆盖。
 *
 * **Admin login strategy:**
 * `ensureAdminToken()` in `global-setup.ts` registers ADMIN_EMAIL with
 * ADMIN_PASSWORD and verifies role === "admin" before any test runs.
 * Browser-side login here reuses those same credentials — no need to call
 * `ensureAdminToken()` again per test.
 *
 * **Every test establishes its own backend state.**
 * These specs share one database with the other specs and run with
 * `workers: 1`. A test that asserts on whatever secret happens to already be
 * configured passes or fails based on how the operator started the backend,
 * not on the code under test — and for the 【关键】 case below that is worse
 * than fragile, it is *vacuous*: with no secret configured there is nothing to
 * wipe, so the test goes green while the bug is fully present. So each test
 * that needs a configured secret configures one first.
 *
 * **Why `r2AccessKeyId` and never `fluxApiKey`:**
 * `settings/runtime.go`'s `buildFlux()` falls back to the stub adapter only
 * while `fluxApiKey` is empty, and `generate.spec.ts` / `history.spec.ts`
 * depend on that stub (real adapter + fake key = upstream auth failures).
 * `r2AccessKeyId` has no effect on adapter selection, so configuring it is
 * invisible to every other spec. Storage also stays disabled — `StorageEnabled()`
 * needs all five R2 fields and three of them remain empty — which keeps
 * `history.spec.ts`'s `stored=false` expectation intact.
 */

/** Sign in as admin through the browser login form. Lands at /account. */
async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/**
 * Configure `r2AccessKeyId` to a known value via the BFF, so the calling test
 * owns its precondition instead of inheriting it.
 *
 * Uses `page.request` rather than the `request` fixture: only the former shares
 * the browser context's cookie jar, and the token cookie is httpOnly. The PATCH
 * passes `checkSameOrigin` because Playwright's API request sends neither
 * `Sec-Fetch-Site` nor `Origin` — the guard deliberately allows non-browser
 * callers, which cannot be a CSRF vector (see lib/bff.ts).
 *
 * Setting a known value at the start of each test also makes these specs
 * idempotent across back-to-back runs against the shared DB.
 */
async function configureAccessKey(page: Page, value: string) {
  const res = await page.request.patch("/api/admin/settings", {
    data: { r2AccessKeyId: value },
  });
  expect(
    res.ok(),
    `precondition failed: could not configure r2AccessKeyId (${res.status()} ${await res.text()})`,
  ).toBeTruthy();
}

/**
 * Assert a specific secret reads as configured.
 *
 * The `^` anchor matters: "Not configured" contains "configured" as a
 * substring, so an unanchored match would accept the exact state this is
 * supposed to rule out.
 */
async function expectSecretConfigured(page: Page, key: string) {
  await expect(page.getByTestId(`secret-status-${key}`)).toHaveText(/^Configured/);
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
  // "Forbidden text is visible" alone does not prove the form is absent — it
  // would still pass if the whole form rendered below the message. Assert each
  // field label is NOT in the DOM.
  for (const label of FIELD_LABELS) {
    await expect(
      page.getByLabel(label),
      `field "${label}" must not exist for a non-admin user`,
    ).toHaveCount(0);
  }
  // No secret status markers either — those leak configured-state and masks.
  await expect(
    page.locator('[data-testid^="secret-status-"]'),
    "no secret status markers should reach a non-admin user",
  ).toHaveCount(0);
});

// ── Case 3 ────────────────────────────────────────────────────────────────────

test("管理员看到八个字段；secret 字段显示配置状态而非明文", async ({ page }) => {
  await signInAsAdmin(page);

  // Establish the precondition: a secret with a value we control, so the
  // plaintext-leak assertion below is about a secret we KNOW is configured.
  const secret = `sk-e2e-plaintext-canary-${Date.now()}`;
  await configureAccessKey(page, secret);

  await page.goto("/admin/settings");

  // All eight field inputs must be rendered.
  for (const label of FIELD_LABELS) {
    await expect(page.getByLabel(label), `field "${label}" must be visible`).toBeVisible();
  }

  // The secret we just set must read as configured — not as plaintext.
  await expectSecretConfigured(page, "r2AccessKeyId");

  // The value must NEVER appear anywhere in the page: not in an input value,
  // an attribute, an RSC payload, or a comment. Asserting on a value this test
  // set itself means the check cannot silently go vacuous.
  const content = await page.content();
  expect(content, "secret plaintext must not leak to the page").not.toContain(secret);
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

  // Establish the precondition rather than inherit it. Without a configured
  // secret this test has nothing to wipe and would pass even with the bug.
  await configureAccessKey(page, `sk-e2e-must-survive-${Date.now()}`);

  await page.goto("/admin/settings");

  // Assert the precondition explicitly BEFORE the edit. If configuring the
  // secret ever stops working, this test fails here — on the precondition —
  // instead of quietly passing the real assertion for the wrong reason.
  await expectSecretConfigured(page, "r2AccessKeyId");

  // Edit only r2Bucket — a plain, non-secret field. The three secret inputs
  // stay empty, exactly as an operator would leave them.
  await page.getByLabel("R2 Bucket").fill(`guard-test-${Date.now()}`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // The secret must STILL be configured. If the form had submitted an empty
  // string for it, the backend would read that as "clear this secret" and this
  // flips to "Not configured". This is the guard for the invariant in the plan:
  // "secret 输入框为空 ⇒ 请求体里根本不带这个 key".
  await expectSecretConfigured(page, "r2AccessKeyId");

  // And it must survive a reload too — proving the surviving state is what the
  // database holds, not just stale component state the client never refreshed.
  await page.reload();
  await expectSecretConfigured(page, "r2AccessKeyId");
});

// ── Case 6 ────────────────────────────────────────────────────────────────────

test("r2PublicBaseUrl 填 S3 API 域名保存失败并显示后端报错原文", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/admin/settings");

  await page.getByLabel("R2 Public Base URL").fill("https://acct.r2.cloudflarestorage.com");
  await page.getByRole("button", { name: "Save" }).click();

  // The backend returns a Chinese validation message mentioning "S3 API 域名"
  // and "不允许匿名读". This page is the intentional exception to the pattern of
  // hiding backend error text — the audience is an admin who needs the exact
  // validation message to diagnose the misconfiguration.
  await expect(
    page.getByText(/S3 API|不允许匿名读|r2\.dev/),
    "backend domain-validation message must be shown verbatim in the form",
  ).toBeVisible();

  // The success badge must not appear alongside the error.
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);

  // The rejected value must not have been persisted — the backend validates
  // every key before touching the database, so a reload shows the old value.
  await page.reload();
  await expect(page.getByLabel("R2 Public Base URL")).not.toHaveValue(
    "https://acct.r2.cloudflarestorage.com",
  );
});

// ── Case 7 — Mobile ───────────────────────────────────────────────────────────

test.describe("移动端（375×667）", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("管理员设置表单在窄屏下可用且无横向溢出", async ({ page }) => {
    await signInAsAdmin(page);
    // Configure a secret so the narrow-screen layout is exercised WITH the
    // "Configured" marker and the Clear button present — that row is the most
    // crowded one on the page and the likeliest to overflow.
    await configureAccessKey(page, `sk-e2e-mobile-${Date.now()}`);

    await page.goto("/admin/settings");

    // The form must load — wait for a representative field.
    await expect(page.getByLabel("R2 Bucket")).toBeVisible();
    await expectSecretConfigured(page, "r2AccessKeyId");
    // The save button must be visible, not clipped.
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();

    // Every field must be wide enough to actually type into on a 375px screen.
    // A label that wraps is fine; an input squeezed to 40px is not.
    for (const label of FIELD_LABELS) {
      const box = await page.getByLabel(label).boundingBox();
      expect(box, `field "${label}" has no layout box`).not.toBeNull();
      expect(
        box!.width,
        `field "${label}" is only ${box!.width}px wide — too narrow to type in`,
      ).toBeGreaterThan(150);
    }

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

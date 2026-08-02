import { defineConfig, devices } from "@playwright/test";

/**
 * 主题 / 设计 token 的专用配置——**刻意不带 globalSetup**。
 *
 * 主配置的 globalSetup 会断言 Go 后端可达并引导管理员账号（发次数需要管理员）。
 * 但 token 是纯前端的，验证它只需要 Next dev server。共用主配置的代价是：
 * 后端没起时，一条纯 CSS 断言也跑不了。
 *
 * 只收 e2e/theme.spec.ts。其余 spec 都要真实后端，仍走 playwright.config.ts——
 * theme.spec.ts 同时也在主配置的收集范围内，`npm run test:e2e` 会再跑一遍，
 * 这是刻意的：CI 一条命令就能全覆盖，不必记住要跑两个配置。
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /theme\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

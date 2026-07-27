import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // 套件开始前重置假数据余额。见该文件顶部注释：不重置的话，第二次本地运行会
  // 从上一次被耗尽的余额开始，正常出图的用例直接拿到 402。
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    // 本地复用省时间；CI 上必须起一个干净的（复用会带进上一个 job 的内存余额）。
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

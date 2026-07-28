import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  // 套件开始前确认 Go 后端在跑、并准备好引导管理员（发次数需要管理员权限）。
  // 见 e2e/global-setup.ts：后端不可达时**大声失败**——静默跳过之后每条用例都会以
  // "余额不足"的形式挂掉，把人指向错误的方向。
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    // 本地复用省时间。注意复用时**不会**重新编译已改动的代码，改完前端要自己重启
    // dev server，否则测的是旧代码。
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

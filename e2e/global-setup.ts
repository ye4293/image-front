import { assertBackendReachable, ensureAdminToken } from "./backend";

/**
 * 套件开始前确认 Go 后端在跑，并把引导管理员准备好。
 *
 * M2 时这里做的是"把假数据余额恢复到初始值"（`POST /api/credits/reset`）。余额现在
 * 活在后端数据库里、按用户隔离，那个接口随整个假数据层一起删掉了，重置也不再需要：
 * `generate.spec.ts` 每条用例注册一个全新邮箱，然后自己领次数。
 *
 * 剩下的准备只有一件：**发次数需要管理员**，而第一个管理员只能由后端的
 * `BOOTSTRAP_ADMIN_EMAIL` 造出来。这里注册那个账号并当场验证它真的是 admin。
 *
 * 后端不可达、或没被引导成管理员时**大声失败**，绝不静默跳过——跳过之后每条用例都会
 * 以"余额不足"的形式挂掉，把人指向扣费逻辑，而真正的原因在这里。
 */
async function globalSetup() {
  await assertBackendReachable();
  await ensureAdminToken();
}

export default globalSetup;

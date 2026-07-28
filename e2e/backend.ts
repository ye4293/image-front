/**
 * 端到端测试与 Go 后端**直接**对话的那部分：确认后端在跑、准备管理员、发次数。
 *
 * 为什么绕过前端：发次数需要管理员权限，而前端没有（也不该有）任何管理界面。
 * 这里做的全是**测试数据准备**，不是被测行为——被测行为一律走浏览器。
 *
 * 为什么不用 globalSetup 把管理员 token 塞进 `process.env` 传给 worker：那依赖
 * "worker 继承 runner 的环境变量"这个实现细节。登录一次很便宜，各进程各自登录，
 * 少一个隐式耦合。
 */

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:8080").replace(/\/$/, "");

/**
 * 引导管理员账号。邮箱必须与后端启动时的 `BOOTSTRAP_ADMIN_EMAIL` 一致，
 * 否则它注册出来只是个普通用户，发次数会 403。
 */
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@example.com";
export const ADMIN_PASSWORD = "e2e-admin-secret-12345";

/** 后端没起来时的统一提示。少了它，症状会伪装成"余额不足"或"注册失败"。 */
const HOW_TO_START = `
后端似乎没有在 ${BACKEND_URL} 运行。在 image-backend 仓库执行：

  BOOTSTRAP_ADMIN_EMAIL=${ADMIN_EMAIL} JWT_SECRET=e2e-secret-not-the-default go run ./cmd/server

**不要**配 FLUX_API_KEY：留空时后端使用 stub adapter，保留 fail/slow/quick
关键词（端到端测试依赖它们），且不会真的调用上游花钱。
`;

async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BACKEND_URL}/api/v1${path}`, init);
  } catch (e) {
    // 连不上必须**大声失败**，不能跳过：跳过之后测试会以"余额不足"的形式挂掉，
    // 把人指向扣费逻辑，而真正的原因是后端根本没起。
    throw new Error(`${HOW_TO_START}\n原始错误：${String(e)}`);
  }
}

const jsonInit = (body: unknown, token?: string): RequestInit => ({
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

/** 后端可达性检查。失败时抛出带启动方法的错误。 */
export async function assertBackendReachable(): Promise<void> {
  const res = await backendFetch("/health");
  if (!res.ok) {
    throw new Error(`${HOW_TO_START}\n/health 返回 ${res.status}`);
  }
}

/**
 * 确保管理员账号存在且真的是 admin，返回它的 token。
 *
 * 409（已注册）是正常情况——同一个后端进程被多次运行的测试复用。
 */
export async function ensureAdminToken(): Promise<string> {
  const reg = await backendFetch(
    "/auth/register",
    jsonInit({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  );
  if (!reg.ok && reg.status !== 409) {
    throw new Error(`注册管理员账号失败：${reg.status} ${await reg.text()}`);
  }

  const login = await backendFetch(
    "/auth/login",
    jsonInit({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  );
  if (!login.ok) {
    throw new Error(
      `管理员登录失败：${login.status} ${await login.text()}\n` +
        `如果是 401，可能是后端换了库但 ${ADMIN_EMAIL} 的密码与本文件不符。`,
    );
  }
  const { token } = (await login.json()) as { token: string };

  const me = await backendFetch("/me", { headers: { authorization: `Bearer ${token}` } });
  if (!me.ok) {
    throw new Error(`读取管理员信息失败：${me.status} ${await me.text()}`);
  }
  const { role } = (await me.json()) as { role: string };
  if (role !== "admin") {
    throw new Error(
      `${ADMIN_EMAIL} 的 role 是 "${role}" 而不是 "admin"。\n` +
        `后端启动时必须带 BOOTSTRAP_ADMIN_EMAIL=${ADMIN_EMAIL}——它是唯一能造出\n` +
        `第一个管理员的途径，而发次数（测试的前置数据）需要管理员权限。\n${HOW_TO_START}`,
    );
  }
  return token;
}

/**
 * 给指定邮箱发次数。**每条用例自己调**：`e2e/generate.spec.ts` 里每条用例都注册一个
 * 全新邮箱，余额是 per-user 的，所以发放也必须 per-user——共用一个账号的话，用例之间
 * 会互相消耗余额，就又回到 M2 那种"只能写相对断言"的约束里。
 */
export async function grantCredits(email: string, monthly: number, addon = 0): Promise<void> {
  const token = await ensureAdminToken();
  const res = await backendFetch("/admin/credits", jsonInit({ email, monthly, addon }, token));
  if (!res.ok) {
    throw new Error(`给 ${email} 发次数失败：${res.status} ${await res.text()}`);
  }
}

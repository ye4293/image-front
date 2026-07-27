import type { BackendError } from "@/lib/backend";
import {
  ERR_UNREACHABLE,
  ERR_MALFORMED,
  ERR_UNRECOGNIZED,
  ERR_BAD_REQUEST,
  ERR_FORBIDDEN,
} from "@/lib/backend";

/**
 * BFF 请求层的共享逻辑：同源校验、凭据解析、错误响应整形。
 *
 * 本模块刻意不 import 任何 `next/*`——保持纯函数、可直接单元测试，
 * 用真实的 `Request` 对象即可覆盖，无需 mock。
 */

export type GuardFailure = { status: number; body: BackendError };

export type CredentialsResult =
  | { ok: true; email: string; password: string }
  | { ok: false; failure: GuardFailure };

/** 路由层在请求到达后端之前自行拒绝时使用的码，语义同后端的同名码，声明在 `lib/backend.ts`。 */
const FORBIDDEN: GuardFailure = {
  status: 403,
  body: { code: ERR_FORBIDDEN, message: "cross-site request rejected" },
};

const BAD_REQUEST: GuardFailure = {
  status: 400,
  body: { code: ERR_BAD_REQUEST, message: "email and password are required" },
};

/** `lib/backend.ts` 合成的 502xx 家族——这些是运维诊断信息，不能透给终端用户。 */
const INFRA_CODES: ReadonlySet<number> = new Set([
  ERR_UNREACHABLE,
  ERR_MALFORMED,
  ERR_UNRECOGNIZED,
]);

const GENERIC_INFRA_MESSAGE = "service temporarily unavailable";

/**
 * CSRF 防护。
 *
 * 注意：**不能**依赖 "JSON content-type 会触发 CORS 预检" 这个假设——`req.json()`
 * 根本不看 Content-Type 头，而跨站 `<form enctype="text/plain">` 是 CORS 简单请求
 * （无预检），其 `name=value` 编码可以构造出合法 JSON。`sameSite: "lax"` 也救不了：
 * 它管的是 cookie 的**发送**，不是**写入**，而这个攻击不需要任何既有 cookie。
 *
 * 判定优先级：
 *   1. `Sec-Fetch-Site` 存在且不是 `same-origin` → 拒绝。当代浏览器都会发这个头，
 *      且页面 JS 无法伪造它。
 *   2. 否则 `Origin` 存在且 host 与请求自身的 host 不符 → 拒绝。
 *   3. 否则放行。
 *
 * 第 3 步是刻意的：两个头都没有的请求不是浏览器发出的，因此根本不构成 CSRF 向量。
 * 不要把它"加固"成默认拒绝——那只会挡住 curl 和未来的服务端到服务端调用，
 * 挡不住攻击者，是虚假的安全感。
 */
export function checkSameOrigin(req: Request): GuardFailure | null {
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite !== null) {
    return secFetchSite === "same-origin" ? null : FORBIDDEN;
  }

  const origin = req.headers.get("origin");
  if (origin !== null) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      // 不可解析的 Origin（例如 `null`，来自 sandboxed iframe / 跨源重定向）——拒绝。
      return FORBIDDEN;
    }
    return originHost === new URL(req.url).host ? null : FORBIDDEN;
  }

  return null;
}

/** 同源校验 + JSON 解析 + 字段存在性校验，三个路由共用。 */
export async function readCredentials(req: Request): Promise<CredentialsResult> {
  const guardFailure = checkSameOrigin(req);
  if (guardFailure) {
    return { ok: false, failure: guardFailure };
  }

  const body: unknown = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return { ok: false, failure: BAD_REQUEST };
  }

  const { email, password } = body as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || !email || typeof password !== "string" || !password) {
    return { ok: false, failure: BAD_REQUEST };
  }

  return { ok: true, email, password };
}

/**
 * 把 `lib/backend.ts` 的失败整形成可以安全回给浏览器的响应。
 *
 * - 502xx 家族：保留 status 与 code（网络面板仍可诊断、监控仍可分级），但把
 *   message 换成通用文案——"backend unreachable" 是给运维看的，不该泄露给
 *   未认证访客。同时在服务端 `console.error` 留痕，否则后端挂了 Next 进程里
 *   毫无信号。绝不记录 token 或密码。
 * - status 钳制：204/304 这类 null-body 状态码传给 `NextResponse.json` 会抛异常。
 *   当前 Go 后端不会返回，但前面挂一个配置错误的反代就会。
 */
export function toClientError(
  error: BackendError,
  status: number,
  route: string,
): { status: number; body: BackendError } {
  const safeStatus = status >= 400 ? status : 502;

  if (INFRA_CODES.has(error.code)) {
    console.error(`[bff:${route}] upstream failure code=${error.code} message=${error.message}`);
    return { status: safeStatus, body: { code: error.code, message: GENERIC_INFRA_MESSAGE } };
  }

  return { status: safeStatus, body: error };
}

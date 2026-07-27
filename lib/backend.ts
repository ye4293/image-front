export type BackendError = { code: number; message: string };

/**
 * 本模块自己合成的错误码（后端不会返回这些）。
 *
 * 后端的码一律原样透传，所以调用方 switch(error.code) 时，码只有两个来源：
 * 后端的业务码，或下面这个 502xx 家族。绝不用 `status * 100` 之类的算术合成——
 * 那会撞车：502 * 100 === 50200 与"连接失败"同码，500 * 100 === 50000 与后端
 * 自己的 internal error 同码，调用方无法区分。
 *
 * 补充：路由层（app/api/auth/*）在请求到达后端之前自行拒绝时，也会发出 40000
 * （请求体不合法）与 40300（跨站请求被拒）。语义与后端的同名码一致，故复用而非
 * 另起一个前端专属码段。
 */
export const ERR_UNREACHABLE = 50200; // 连不上后端（fetch 抛异常）
export const ERR_MALFORMED = 50201; // 2xx 但响应体为空或非 JSON
export const ERR_UNRECOGNIZED = 50202; // 错误响应体里没有可用的 code 字段

/**
 * 业务错误码。这些是**wire 契约**——浏览器端也要按码分支（例如工作台比较
 * 40001 决定是否弹升级框），因此必须只有一处声明。以前 `lib/bff.ts` 与
 * `app/api/generations/route.ts` 各自声明了同名同值的局部常量，改一处漏一处
 * 的风险是实打实的。语义与后端的同名码一致，故复用而非另起前端专属码段。
 */
export const ERR_BAD_REQUEST = 40000; // 请求体不合法（缺字段、字段非法、未知枚举值）
export const ERR_INSUFFICIENT_CREDITS = 40001; // 余额不足，HTTP 402
/**
 * 模型**存在但当前不可用**（被禁用、上游降级）。注意与 40000 的区别：未知的
 * model id 是请求格式错误（过期的客户端），要回 40000；把两者混为一谈会让
 * 前端对一个过期客户端显示"模型不可用"，用户去等一个永远不会恢复的模型。
 * 本轮假数据里所有模型恒定可用，故没有代码路径发出此码——它为真后端预留。
 */
export const ERR_MODEL_UNAVAILABLE = 40003;
export const ERR_FORBIDDEN = 40300; // 跨站请求被拒

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: BackendError };

export type RegisteredUser = { id: number; email: string };
export type LoginResult = { token: string };
export type CurrentUser = { id: number; email: string; role: string };

export type Credentials = { email: string; password: string };

function backendUrl(path: string): string {
  const base = process.env.BACKEND_URL ?? "http://localhost:8080";
  return `${base.replace(/\/$/, "")}/api/v1${path}`;
}

async function request<T>(path: string, init: RequestInit): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(backendUrl(path), init);
  } catch {
    return { ok: false, status: 502, error: { code: ERR_UNREACHABLE, message: "backend unreachable" } };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = body as Partial<BackendError> | null;
    return {
      ok: false,
      status: res.status,
      error: {
        code: typeof err?.code === "number" ? err.code : ERR_UNRECOGNIZED,
        message: typeof err?.message === "string" ? err.message : "unexpected error",
      },
    };
  }

  // A 2xx with an empty/unparseable body would otherwise be handed to callers as
  // `data: null` despite a non-null type. Surface it as a structured failure instead.
  if (body === null) {
    return {
      ok: false,
      status: 502,
      error: { code: ERR_MALFORMED, message: "malformed backend response" },
    };
  }

  return { ok: true, data: body as T };
}

const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function registerUser(creds: Credentials): Promise<Result<RegisteredUser>> {
  return request<RegisteredUser>("/auth/register", jsonPost(creds));
}

export function loginUser(creds: Credentials): Promise<Result<LoginResult>> {
  return request<LoginResult>("/auth/login", jsonPost(creds));
}

export function fetchMe(token: string): Promise<Result<CurrentUser>> {
  return request<CurrentUser>("/me", {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

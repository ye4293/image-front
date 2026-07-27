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

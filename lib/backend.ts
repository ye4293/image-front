export type BackendError = { code: number; message: string };

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
    return { ok: false, status: 502, error: { code: 50200, message: "backend unreachable" } };
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
        code: typeof err?.code === "number" ? err.code : res.status * 100,
        message: typeof err?.message === "string" ? err.message : "unexpected error",
      },
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

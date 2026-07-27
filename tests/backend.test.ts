import { describe, it, expect, vi, afterEach } from "vitest";
import { registerUser, loginUser, fetchMe } from "@/lib/backend";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registerUser", () => {
  it("成功时返回用户 id 与 email", async () => {
    const fn = mockFetch(201, { id: 1, email: "a@b.com" });
    const res = await registerUser({ email: "a@b.com", password: "secret12345" });
    expect(res).toEqual({ ok: true, data: { id: 1, email: "a@b.com" } });
    expect(fn).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/auth/register",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.com", password: "secret12345" }),
      }),
    );
  });

  it("邮箱重复时返回 409 与后端 code", async () => {
    mockFetch(409, { code: 40901, message: "email already registered" });
    const res = await registerUser({ email: "a@b.com", password: "secret12345" });
    expect(res).toEqual({
      ok: false,
      status: 409,
      error: { code: 40901, message: "email already registered" },
    });
  });
});

describe("loginUser", () => {
  it("成功时返回 token", async () => {
    mockFetch(200, { token: "jwt.token.here" });
    const res = await loginUser({ email: "a@b.com", password: "secret12345" });
    expect(res).toEqual({ ok: true, data: { token: "jwt.token.here" } });
  });

  it("密码错误时返回 401", async () => {
    mockFetch(401, { code: 40101, message: "invalid email or password" });
    const res = await loginUser({ email: "a@b.com", password: "wrong" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(40101);
  });
});

describe("fetchMe", () => {
  it("带上 Bearer token 并返回用户", async () => {
    const fn = mockFetch(200, { id: 1, email: "a@b.com", role: "user" });
    const res = await fetchMe("jwt.token.here");
    expect(res).toEqual({ ok: true, data: { id: 1, email: "a@b.com", role: "user" } });
    expect(fn).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/me",
      expect.objectContaining({
        headers: { authorization: "Bearer jwt.token.here" },
        cache: "no-store",
      }),
    );
  });

  it("token 失效时返回 401", async () => {
    mockFetch(401, { code: 40100, message: "invalid token" });
    const res = await fetchMe("bad");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });
});

describe("非 JSON 响应", () => {
  it("后端挂了返回 502 兜底错误", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    const res = await loginUser({ email: "a@b.com", password: "x" });
    expect(res).toEqual({
      ok: false,
      status: 502,
      error: { code: 50200, message: "backend unreachable" },
    });
  });
});

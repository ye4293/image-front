import { describe, it, expect, vi, afterEach } from "vitest";
import {
  registerUser,
  loginUser,
  fetchMe,
  ERR_UNREACHABLE,
  ERR_MALFORMED,
  ERR_UNRECOGNIZED,
} from "@/lib/backend";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Mocks a response with a raw, unparseable-as-JSON body. */
function mockFetchRaw(status: number, rawBody: string) {
  const fn = vi.fn(async () => new Response(rawBody, { status }));
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

describe("网络失败", () => {
  it("后端连不上时返回 502 兜底错误", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    const res = await loginUser({ email: "a@b.com", password: "x" });
    expect(res).toEqual({
      ok: false,
      status: 502,
      error: { code: ERR_UNREACHABLE, message: "backend unreachable" },
    });
  });
});

describe("非 JSON 响应", () => {
  it("错误响应体不是 JSON 时走 ERR_UNRECOGNIZED 与 unexpected error 兜底", async () => {
    mockFetchRaw(502, "<html>502 Bad Gateway</html>");
    const res = await loginUser({ email: "a@b.com", password: "x" });
    // 用固定常量而非 status*100：后者会让网关 502 与"连不上后端"同码，无法区分。
    expect(res).toEqual({
      ok: false,
      status: 502,
      error: { code: ERR_UNRECOGNIZED, message: "unexpected error" },
    });
    expect(ERR_UNRECOGNIZED).not.toBe(ERR_UNREACHABLE);
  });

  it("错误响应体缺少 code/message 字段时同样走兜底", async () => {
    mockFetch(500, { detail: "something broke" });
    const res = await loginUser({ email: "a@b.com", password: "x" });
    // 后端真实的 internal error 码是 50000；兜底码必须与它不同，否则调用方
    // 分不清"后端说它内部错了"和"后端给了个我们读不懂的错误体"。
    expect(res).toEqual({
      ok: false,
      status: 500,
      error: { code: ERR_UNRECOGNIZED, message: "unexpected error" },
    });
    expect(ERR_UNRECOGNIZED).not.toBe(50000);
  });

  it("2xx 响应体无法解析时返回 ERR_MALFORMED 而不是 ok:true + null", async () => {
    mockFetchRaw(200, "");
    const res = await loginUser({ email: "a@b.com", password: "secret12345" });
    expect(res).toEqual({
      ok: false,
      status: 502,
      error: { code: ERR_MALFORMED, message: "malformed backend response" },
    });
  });

  it("204 无内容响应不会把 null 当作成功数据返回", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const res = await fetchMe("jwt.token.here");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(ERR_MALFORMED);
  });
});

describe("后端契约中的其他错误码", () => {
  it("注册时密码格式非法返回 400 与 40000", async () => {
    mockFetch(400, { code: 40000, message: "invalid email or password format" });
    const res = await registerUser({ email: "a@b.com", password: "short" });
    expect(res).toEqual({
      ok: false,
      status: 400,
      error: { code: 40000, message: "invalid email or password format" },
    });
  });

  it("登录时请求体非法返回 400 与 40000", async () => {
    mockFetch(400, { code: 40000, message: "invalid email or password format" });
    const res = await loginUser({ email: "not-an-email", password: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error.code).toBe(40000);
    }
  });

  it("后端内部错误返回 500 与 50000", async () => {
    mockFetch(500, { code: 50000, message: "internal error" });
    const res = await registerUser({ email: "a@b.com", password: "secret12345" });
    expect(res).toEqual({
      ok: false,
      status: 500,
      error: { code: 50000, message: "internal error" },
    });
  });

  it("/me 内部错误同样透传 50000", async () => {
    mockFetch(500, { code: 50000, message: "internal error" });
    const res = await fetchMe("jwt.token.here");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(50000);
  });
});

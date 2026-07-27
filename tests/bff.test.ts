import { describe, it, expect, vi, afterEach } from "vitest";
import { checkSameOrigin, readCredentials, toClientError } from "@/lib/bff";
import { ERR_UNREACHABLE, ERR_MALFORMED, ERR_UNRECOGNIZED } from "@/lib/backend";

const URL_LOGIN = "https://app.example/api/auth/login";

function req(headers: Record<string, string>, body?: string): Request {
  return new Request(URL_LOGIN, {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

function jsonReq(headers: Record<string, string>, body: unknown): Request {
  return req(headers, JSON.stringify(body));
}

const SAME_ORIGIN = { "sec-fetch-site": "same-origin" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkSameOrigin", () => {
  it("allows Sec-Fetch-Site: same-origin", () => {
    expect(checkSameOrigin(req({ "sec-fetch-site": "same-origin" }))).toBeNull();
  });

  it("rejects Sec-Fetch-Site: cross-site with 403", () => {
    const failure = checkSameOrigin(req({ "sec-fetch-site": "cross-site" }));
    expect(failure?.status).toBe(403);
  });

  it("rejects Sec-Fetch-Site: same-site with 403", () => {
    const failure = checkSameOrigin(req({ "sec-fetch-site": "same-site" }));
    expect(failure?.status).toBe(403);
  });

  it("rejects Sec-Fetch-Site: none with 403", () => {
    // `none` means user-initiated navigation, never a legitimate fetch to this route.
    expect(checkSameOrigin(req({ "sec-fetch-site": "none" }))?.status).toBe(403);
  });

  it("allows a matching Origin when Sec-Fetch-Site is absent", () => {
    expect(checkSameOrigin(req({ origin: "https://app.example" }))).toBeNull();
  });

  it("rejects a mismatched Origin when Sec-Fetch-Site is absent", () => {
    const failure = checkSameOrigin(req({ origin: "http://evil.example" }));
    expect(failure?.status).toBe(403);
  });

  it("rejects an unparseable Origin when Sec-Fetch-Site is absent", () => {
    expect(checkSameOrigin(req({ origin: "null" }))?.status).toBe(403);
  });

  it("allows a request with neither header (curl / server-to-server)", () => {
    expect(checkSameOrigin(req({}))).toBeNull();
  });

  it("prefers Sec-Fetch-Site over a matching Origin", () => {
    const failure = checkSameOrigin(
      req({ "sec-fetch-site": "cross-site", origin: "https://app.example" }),
    );
    expect(failure?.status).toBe(403);
  });
});

describe("readCredentials", () => {
  it("returns the credentials for a valid same-origin body", async () => {
    const result = await readCredentials(
      jsonReq(SAME_ORIGIN, { email: "a@b.com", password: "secret12345" }),
    );
    expect(result).toEqual({ ok: true, email: "a@b.com", password: "secret12345" });
  });

  it("rejects a cross-site request with 403 before parsing the body", async () => {
    const result = await readCredentials(
      jsonReq({ "sec-fetch-site": "cross-site" }, { email: "a@b.com", password: "pw" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.status).toBe(403);
  });

  it("rejects an unparseable body with 400", async () => {
    const result = await readCredentials(req(SAME_ORIGIN, "not json at all"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.status).toBe(400);
  });

  it("rejects a missing email with 400", async () => {
    const result = await readCredentials(jsonReq(SAME_ORIGIN, { password: "secret12345" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.status).toBe(400);
  });

  it("rejects a missing password with 400", async () => {
    const result = await readCredentials(jsonReq(SAME_ORIGIN, { email: "a@b.com" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.status).toBe(400);
  });

  it("rejects non-string fields with 400", async () => {
    const result = await readCredentials(jsonReq(SAME_ORIGIN, { email: 1, password: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.status).toBe(400);
  });

  it("rejects a JSON body that is not an object with 400", async () => {
    const result = await readCredentials(req(SAME_ORIGIN, '"just a string"'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.status).toBe(400);
  });
});

describe("toClientError", () => {
  it("passes a backend business error through untouched", () => {
    const out = toClientError({ code: 40101, message: "invalid email or password" }, 401, "login");
    expect(out).toEqual({
      status: 401,
      body: { code: 40101, message: "invalid email or password" },
    });
  });

  it("replaces the message for ERR_UNREACHABLE but keeps code and status", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = toClientError({ code: ERR_UNREACHABLE, message: "backend unreachable" }, 502, "login");
    expect(out.status).toBe(502);
    expect(out.body.code).toBe(ERR_UNREACHABLE);
    expect(out.body.message).toBe("service temporarily unavailable");
  });

  it("replaces the message for ERR_MALFORMED", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = toClientError({ code: ERR_MALFORMED, message: "malformed backend response" }, 502, "login");
    expect(out.body.message).toBe("service temporarily unavailable");
  });

  it("replaces the message for ERR_UNRECOGNIZED", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = toClientError({ code: ERR_UNRECOGNIZED, message: "unexpected error" }, 500, "login");
    expect(out.body.message).toBe("service temporarily unavailable");
  });

  it("logs server-side on the 502xx path, without any credential material", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    toClientError({ code: ERR_UNREACHABLE, message: "backend unreachable" }, 502, "login");
    expect(spy).toHaveBeenCalledOnce();
    const logged = spy.mock.calls[0].join(" ");
    expect(logged).toContain("login");
    expect(logged).toContain(String(ERR_UNREACHABLE));
  });

  it("does not log for ordinary backend business errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    toClientError({ code: 40901, message: "email already registered" }, 409, "register");
    expect(spy).not.toHaveBeenCalled();
  });

  it("clamps a null-body status to 502", () => {
    expect(toClientError({ code: 12345, message: "x" }, 204, "login").status).toBe(502);
    expect(toClientError({ code: 12345, message: "x" }, 304, "login").status).toBe(502);
  });

  it("clamps any sub-400 status to 502", () => {
    expect(toClientError({ code: 12345, message: "x" }, 200, "login").status).toBe(502);
  });
});

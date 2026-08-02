import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchAdminSettings,
  patchAdminSettings,
  ERR_UNREACHABLE,
} from "@/lib/backend";

/**
 * Duplicated from tests/backend.test.ts rather than re-exported.
 *
 * 选择复制而非从 backend.test.ts 导出的理由：
 * 1. 测试文件互相 import 会形成 test→test 的依赖，下游测试的运行开始依赖上游测试文件的
 *    副作用（vitest 全局的 stubGlobal 等），跑单文件时行为会和全量跑不一致。
 * 2. 这个 helper 只有 4 行，维护成本极低；遇到需要修改时也容易发现两处。
 * 3. 保持 tests/backend.test.ts 不变——本次任务范围外的文件改得越少越好。
 */
function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// 测试夹具
// ---------------------------------------------------------------------------

/** 后端 GET /admin/settings 返回的 wire 形状 */
const wireSettings = {
  ezlinkaiBaseUrl: { value: "https://elink.ai" },
  fluxApiKey: { configured: true, masked: "••••cd12" },
  r2Endpoint: { value: "https://r2.example.com" },
  r2AccessKeyId: { configured: false, masked: "" },
  r2SecretAccessKey: { configured: true, masked: "••••efgh" },
  r2Bucket: { value: "my-bucket" },
  r2PublicBaseUrl: { value: "https://pub.example.com" },
  appBaseUrl: { value: "https://app.example.com" },
};

/** 期望映射后的 AdminSettings.fields（判别联合，不是可选字段） */
const mappedFields = {
  ezlinkaiBaseUrl: { kind: "plain", value: "https://elink.ai" },
  fluxApiKey: { kind: "secret", configured: true, masked: "••••cd12" },
  r2Endpoint: { kind: "plain", value: "https://r2.example.com" },
  r2AccessKeyId: { kind: "secret", configured: false, masked: "" },
  r2SecretAccessKey: { kind: "secret", configured: true, masked: "••••efgh" },
  r2Bucket: { kind: "plain", value: "my-bucket" },
  r2PublicBaseUrl: { kind: "plain", value: "https://pub.example.com" },
  appBaseUrl: { kind: "plain", value: "https://app.example.com" },
};

// ---------------------------------------------------------------------------
// fetchAdminSettings
// ---------------------------------------------------------------------------

describe("fetchAdminSettings", () => {
  it("成功时返回 fields 与 storageEnabled，并带 Authorization: Bearer", async () => {
    const fn = mockFetch(200, { settings: wireSettings, storageEnabled: true });
    const res = await fetchAdminSettings("admin-tok");

    // 响应体映射正确
    expect(res).toEqual({
      ok: true,
      data: { fields: mappedFields, storageEnabled: true },
    });

    // 带上 token，走正确的端点
    expect(fn).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/admin/settings",
      expect.objectContaining({
        headers: { authorization: "Bearer admin-tok" },
        cache: "no-store",
      }),
    );
  });

  it("非管理员 → 403 透出", async () => {
    mockFetch(403, { code: 40300, message: "forbidden" });
    const res = await fetchAdminSettings("user-tok");
    expect(res).toEqual({
      ok: false,
      status: 403,
      error: { code: 40300, message: "forbidden" },
    });
  });
});

// ---------------------------------------------------------------------------
// patchAdminSettings
// ---------------------------------------------------------------------------

describe("patchAdminSettings", () => {
  it("只把传入的 key 放进请求体，成功时返回映射后的 AdminSettings", async () => {
    const fn = mockFetch(200, { settings: wireSettings, storageEnabled: true });
    const res = await patchAdminSettings("admin-tok", { r2Bucket: "new-bucket" });

    expect(res).toEqual({
      ok: true,
      data: { fields: mappedFields, storageEnabled: true },
    });
    expect(fn).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/admin/settings",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ r2Bucket: "new-bucket" }),
        headers: expect.objectContaining({ authorization: "Bearer admin-tok" }),
      }),
    );
  });

  it("【守卫】不会自动补全未传的 key——body 的 key 集合与入参完全一致", async () => {
    /**
     * 这条单测守的就是计划开头那个陷阱：
     * 后端把 secret 的空字符串理解为"清空"，而不是"不改"。
     * 若实现自动在 body 里塞了 SECRET_KEYS 的空值（哪怕只是"帮忙"补全），
     * JSON.stringify 的字符串就会比 JSON.stringify(input) 长，断言立刻失败。
     */
    const fn = mockFetch(200, { settings: wireSettings, storageEnabled: true });
    const input = { r2Bucket: "bucket-guard-test" };
    await patchAdminSettings("admin-tok", input);

    expect(fn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify(input) }),
    );
  });

  it("400 时透出后端的 code/message（校验失败）", async () => {
    mockFetch(400, { code: 40000, message: "invalid r2 endpoint" });
    const res = await patchAdminSettings("admin-tok", { r2Endpoint: "not-a-url" });
    expect(res).toEqual({
      ok: false,
      status: 400,
      error: { code: 40000, message: "invalid r2 endpoint" },
    });
  });

  it("后端不可达 → ERR_UNREACHABLE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const res = await patchAdminSettings("admin-tok", { r2Bucket: "x" });
    expect(!res.ok && res.error.code).toBe(ERR_UNREACHABLE);
  });
});

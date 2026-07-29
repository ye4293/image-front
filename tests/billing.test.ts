import { describe, it, expect } from "vitest";
import { billingErrorKey } from "@/lib/billing-errors";
import { safeNextPath } from "@/lib/safe-next";
import {
  ERR_BAD_REQUEST,
  ERR_BILLING_NOT_CONFIGURED,
  ERR_INSUFFICIENT_CREDITS,
  ERR_NO_BILLING_ACCOUNT,
  ERR_PAYMENT_PROVIDER,
  ERR_PLAN_NOT_PURCHASABLE,
} from "@/lib/backend";

describe("billingErrorKey", () => {
  it("区分 50300（未配置）与 50301（价格未播种）", () => {
    // 两者都是 503，但**用户能做的事不同**：50300 是支付功能整体没开，50301 是这一档还没
    // 建好价格（换一档可能就能买）。都显示成"出错了"会让人反复重试同一个按钮。
    expect(billingErrorKey(ERR_BILLING_NOT_CONFIGURED, "checkout")).toBe("notConfigured");
    expect(billingErrorKey(ERR_PLAN_NOT_PURCHASABLE, "checkout")).toBe("planNotReady");
    expect(billingErrorKey(ERR_BILLING_NOT_CONFIGURED, "checkout")).not.toBe(
      billingErrorKey(ERR_PLAN_NOT_PURCHASABLE, "checkout"),
    );
  });

  it("40001 按接口给不同文案：Portal 是没有账单账户，结账路径回落成通用文案", () => {
    // 后端在两个接口上复用了 40001（`/generations` 上它是余额不足）。一张全局码表会把一个
    // 从没结过账的用户的"没有账单账户"显示成"次数不够"。
    expect(ERR_NO_BILLING_ACCOUNT).toBe(ERR_INSUFFICIENT_CREDITS); // 同值，不是笔误
    expect(billingErrorKey(ERR_NO_BILLING_ACCOUNT, "portal")).toBe("noBillingAccount");
    expect(billingErrorKey(ERR_NO_BILLING_ACCOUNT, "checkout")).toBe("genericError");
  });

  it("结账时的 40000 = 档位已下架，提示刷新；Portal 不发这个码，回落通用文案", () => {
    expect(billingErrorKey(ERR_BAD_REQUEST, "checkout")).toBe("unknownPlan");
    expect(billingErrorKey(ERR_BAD_REQUEST, "portal")).toBe("genericError");
  });

  it("50200 两个接口都提示稍后重试", () => {
    expect(billingErrorKey(ERR_PAYMENT_PROVIDER, "checkout")).toBe("providerUnavailable");
    expect(billingErrorKey(ERR_PAYMENT_PROVIDER, "portal")).toBe("providerUnavailable");
  });

  it("未知码走兜底，绝不抛异常", () => {
    expect(billingErrorKey(0, "checkout")).toBe("genericError");
    expect(billingErrorKey(99999, "portal")).toBe("genericError");
  });
});

describe("safeNextPath", () => {
  it("放行站内绝对路径", () => {
    expect(safeNextPath("/pricing")).toBe("/pricing");
    expect(safeNextPath("/account?tab=billing")).toBe("/account?tab=billing");
  });

  it("拒绝一切能跳出站的写法", () => {
    // 这些不是理论风险：`/login?next=…` 是可以直接发给受害者的链接，域名是我们的、登录
    // 表单是真的，登录成功后落在钓鱼页上。
    expect(safeNextPath("https://evil.example/")).toBeNull();
    expect(safeNextPath("//evil.example/")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull(); // 浏览器把反斜杠当正斜杠
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
    expect(safeNextPath("pricing")).toBeNull(); // 相对路径，语义不明确
  });

  it("拒绝含控制字符的路径（那是用来绕过前缀检查的）", () => {
    // 转义序列写法，**不要**把它们粘成真的控制字符：源文件里的不可见字节以后没人敢动。
    expect(safeNextPath("/\nhttps://evil.example")).toBeNull();
    expect(safeNextPath("/\tpricing")).toBeNull();
    // DEL(0x7f) 用 fromCharCode 构造，而不是往字面量里塞一个不可见字节。
    expect(safeNextPath(`/${String.fromCharCode(0x7f)}pricing`)).toBeNull();
  });

  it("空值回落成 null，交给调用方决定默认去处", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath("")).toBeNull();
  });
});

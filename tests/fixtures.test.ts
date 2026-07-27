import { describe, it, expect } from "vitest";
import { planSpend, applySpend, applyRefund, resolvePromptBehavior } from "@/lib/fixtures";
import type { CreditBalance } from "@/lib/generation-types";

const balance = (monthly: number, addon: number): CreditBalance => ({ monthly, addon });

describe("planSpend", () => {
  it("月度余额充足时只扣月度", () => {
    expect(planSpend(balance(10, 5), 3)).toEqual({ monthly: 3, addon: 0 });
  });

  it("月度不足时先扣光月度再扣加量包", () => {
    expect(planSpend(balance(2, 10), 5)).toEqual({ monthly: 2, addon: 3 });
  });

  it("月度为零时全扣加量包", () => {
    expect(planSpend(balance(0, 10), 4)).toEqual({ monthly: 0, addon: 4 });
  });

  it("总额恰好等于所需时通过（边界）", () => {
    expect(planSpend(balance(2, 3), 5)).toEqual({ monthly: 2, addon: 3 });
  });

  it("总额差一时返回 null（边界）", () => {
    expect(planSpend(balance(2, 2), 5)).toBeNull();
  });

  it("两种余额都为零时返回 null", () => {
    expect(planSpend(balance(0, 0), 1)).toBeNull();
  });

  it("负数 cost 返回 null（否则凭空造出次数）", () => {
    expect(planSpend(balance(5, 5), -5)).toBeNull();
  });

  it("非整数 cost 返回 null", () => {
    expect(planSpend(balance(5, 5), 1.5)).toBeNull();
  });

  it("cost 为 0 返回 null", () => {
    expect(planSpend(balance(5, 5), 0)).toBeNull();
  });
});

describe("applySpend / applyRefund", () => {
  it("扣费后余额按拆分减少", () => {
    const split = { monthly: 2, addon: 3 };
    expect(applySpend(balance(2, 10), split)).toEqual({ monthly: 0, addon: 7 });
  });

  it("退款把余额精确还原", () => {
    const before = balance(2, 10);
    const split = planSpend(before, 5)!;
    const after = applySpend(before, split);
    expect(applyRefund(after, split)).toEqual(before);
  });

  it("退款按原拆分还回，不会把加量包次数错还成月度", () => {
    // 月度 1 + 加量包 4 = 扣 5，退款必须还回 1 月度 + 4 加量包，
    // 而不是 5 月度——后者会在月底重置时凭空蒸发 4 次。
    const before = balance(1, 10);
    const split = planSpend(before, 5)!;
    expect(split).toEqual({ monthly: 1, addon: 4 });
    const after = applySpend(before, split);
    expect(applyRefund(after, split)).toEqual({ monthly: 1, addon: 10 });
  });

  it("扣费与退款都不修改传入对象（纯函数）", () => {
    const before = balance(5, 5);
    const split = planSpend(before, 3)!;
    applySpend(before, split);
    applyRefund(before, split);
    expect(before).toEqual({ monthly: 5, addon: 5 });
  });
});

describe("resolvePromptBehavior", () => {
  it("普通 prompt 15 秒后成功", () => {
    expect(resolvePromptBehavior("a cat astronaut")).toEqual({ delayMs: 15000, outcome: "succeeded" });
  });

  it("含 fail 的 prompt 8 秒后失败", () => {
    expect(resolvePromptBehavior("please fail this")).toEqual({ delayMs: 8000, outcome: "failed" });
  });

  it("含 slow 的 prompt 90 秒后成功", () => {
    expect(resolvePromptBehavior("a slow sunset")).toEqual({ delayMs: 90000, outcome: "succeeded" });
  });

  it("含 quick 的 prompt 1 秒后成功（供端到端测试用）", () => {
    expect(resolvePromptBehavior("quick test")).toEqual({ delayMs: 1000, outcome: "succeeded" });
  });

  it("关键词匹配不区分大小写", () => {
    expect(resolvePromptBehavior("FAIL NOW").outcome).toBe("failed");
  });

  it("fail 的优先级高于 quick", () => {
    expect(resolvePromptBehavior("quick fail").outcome).toBe("failed");
  });

  it("fail 的优先级高于 slow", () => {
    expect(resolvePromptBehavior("slow fail").outcome).toBe("failed");
  });

  it("slow 的优先级高于 quick", () => {
    expect(resolvePromptBehavior("quick slow").delayMs).toBe(90000);
  });

  it("子串匹配是刻意行为", () => {
    // "slow-motion" 里的 slow 会命中。关键词是子串匹配，"failure"、"slowly"
    // 同样触发——这是刻意的（好记、好在 e2e 里构造），不是 bug。
    expect(resolvePromptBehavior("a slow-motion waterfall").delayMs).toBe(90000);
  });
});

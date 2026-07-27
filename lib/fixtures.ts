/**
 * 本轮的假数据与内存状态。接入真实后端时**整体删除本文件**。
 *
 * 上半部分是纯函数（可单测），下半部分是模块级可变状态（不可单测，
 * 由端到端测试覆盖）。两者刻意分开。
 */

import type {
  AddonPack,
  AspectRatio,
  CreditBalance,
  CreditSplit,
  ImageModel,
  Plan,
} from "@/lib/generation-types";

// ─────────────────────────── 纯函数 ───────────────────────────

/**
 * 计算一次扣费在两种余额上的拆分：先扣月度，不够再扣加量包。
 * 余额不足返回 null（调用方据此返回 40001）。
 *
 * 返回拆分而不是直接扣，是因为**退款必须按同样的拆分还回去**——
 * 把加量包次数错还成月度次数，会在月底重置时凭空蒸发。
 */
export function planSpend(balance: CreditBalance, cost: number): CreditSplit | null {
  // cost 必须是正整数。负数会凭空造出次数（min(5,-5) === -5 然后被"退"回余额），
  // 非整数会让退款的浮点往返不精确。后端的条件原子更新同样要守这条前置条件。
  if (!Number.isInteger(cost) || cost <= 0) return null;
  if (balance.monthly + balance.addon < cost) return null;
  const monthly = Math.min(balance.monthly, cost);
  return { monthly, addon: cost - monthly };
}

/**
 * 前置条件：`split` **必须**来自针对同一份 `balance` 的 `planSpend`。拿别处的
 * 拆分来扣会扣出负余额。另注意 `CreditSplit` 与 `CreditBalance` 结构完全相同，
 * 两个参数写反了编译器不报错——顺序是 (余额, 拆分)。
 */
export function applySpend(balance: CreditBalance, split: CreditSplit): CreditBalance {
  return {
    monthly: balance.monthly - split.monthly,
    addon: balance.addon - split.addon,
  };
}

/**
 * 前置条件：`split` **必须**是当初 `applySpend` 用的那一份，否则就会把加量包
 * 次数错还成月度次数（月底重置时凭空蒸发）。参数顺序同样是 (余额, 拆分)，
 * 结构相同故写反了不报错。
 */
export function applyRefund(balance: CreditBalance, split: CreditSplit): CreditBalance {
  return {
    monthly: balance.monthly + split.monthly,
    addon: balance.addon + split.addon,
  };
}

export type PromptBehavior = {
  delayMs: number;
  outcome: "succeeded" | "failed";
};

/**
 * 用 prompt 关键词做**确定性**触发，不用随机——随机的失败路径无法稳定复现，
 * 也没法写自动化测试。
 *
 * 优先级：fail > slow > quick > 默认。
 *
 * 匹配是**子串匹配**且不区分大小写：`"failure"`、`"slowly"`、`"quickly"` 都会
 * 触发。这是刻意的（好记、好在 e2e 里构造），但代价是 "a failing bridge at
 * sunset" 会秒失败——撞上时那是设计，不是 bug。
 */
export function resolvePromptBehavior(prompt: string): PromptBehavior {
  const p = prompt.toLowerCase();
  if (p.includes("fail")) return { delayMs: 8000, outcome: "failed" };
  if (p.includes("slow")) return { delayMs: 90000, outcome: "succeeded" };
  if (p.includes("quick")) return { delayMs: 1000, outcome: "succeeded" };
  return { delayMs: 15000, outcome: "succeeded" };
}

// ─────────────────────────── 假数据 ───────────────────────────

// 这些常量全部 readonly：Next.js 里模块级值是**进程级**的，跨请求共享。
// 一个组件里顺手写个 `PLANS.sort(...)` 就会永久改掉所有后续请求看到的顺序。

export const MODELS: readonly Readonly<ImageModel>[] = [
  { id: "flux-schnell", name: "Flux Schnell", credits: 1, supportsImageToImage: false },
  { id: "flux-pro", name: "Flux Pro", credits: 2, supportsImageToImage: true },
  { id: "nanobanana", name: "Nanobanana", credits: 3, supportsImageToImage: true },
];

/** `satisfies` 而非 `:`，这样 `as const` 的字面量联合得以保留，同时被 `AspectRatio` 约束。 */
export const ASPECT_RATIOS = ["1:1", "16:9", "9:16"] as const satisfies readonly AspectRatio[];

export const PLANS: readonly Readonly<Plan>[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Trying things out",
    priceUsd: 9,
    monthlyCredits: 200,
    features: ["全部模型", "图生图", "历史记录", "可购加量包"],
    highlighted: false,
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Regular creative work",
    priceUsd: 29,
    monthlyCredits: 800,
    features: ["Starter 全部内容", "生成优先排队", "私密生成", "商用授权"],
    highlighted: true,
  },
  {
    id: "max",
    name: "Max",
    tagline: "High volume / teams",
    priceUsd: 99,
    monthlyCredits: 3000,
    features: ["Pro 全部内容", "最高并发", "优先支持"],
    highlighted: false,
  },
];

export const ADDON_PACKS: readonly Readonly<AddonPack>[] = [
  { id: "pack-100", credits: 100, priceUsd: 5 },
  { id: "pack-450", credits: 450, priceUsd: 20 },
  { id: "pack-1200", credits: 1200, priceUsd: 50 },
];

export const PLACEHOLDER_IMAGE_URL = "/placeholder-generation.svg";

// ─────────────────────── 内存状态（会随 dev server 重启丢失）───────────────────────

/**
 * 初始值刻意设成 12 + 3 = 15 次：用 Flux Pro（2 次/张）点 6 次后月度只剩 0，
 * 第 7 次跨过月度耗尽、开始扣加量包，第 8 次余额不足弹升级框。
 * **手工点几下就能走到所有边界，不用改代码造数据**——不要为了图省事改成 100，
 * 那样端到端场景 3（余额不足）就得点 50 次。
 */
let balance: CreditBalance = { monthly: 12, addon: 3 };

/** 只读快照。返回副本，调用方改它不会影响进程级状态。 */
export function getBalance(): CreditBalance {
  return { ...balance };
}

/**
 * 读—改—写余额。**必须**通过本函数修改，不要暴露独立的 setter。
 *
 * 原因：Node 单线程下，`读 → 计算 → 写` 只在中间没有 `await` 时才是原子的。
 * 如果调用方自己持有旧余额、await 一个耗时操作、再写回去，并发请求会静默
 * 丢失一次扣费。把整个序列锁在一个同步回调里，这个窗口就不可能被拉开。
 */
export function mutateBalance(fn: (current: CreditBalance) => CreditBalance): CreditBalance {
  balance = { ...fn({ ...balance }) };
  return { ...balance };
}

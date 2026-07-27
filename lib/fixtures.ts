import type {
  AddonPack,
  CreditBalance,
  CreditSplit,
  ImageModel,
  Plan,
} from "@/lib/generation-types";

/**
 * 本轮的假数据与内存状态。接入真实后端时**整体删除本文件**。
 *
 * 上半部分是纯函数（可单测），下半部分是模块级可变状态（不可单测，
 * 由端到端测试覆盖）。两者刻意分开。
 */

// ─────────────────────────── 纯函数 ───────────────────────────

/**
 * 计算一次扣费在两种余额上的拆分：先扣月度，不够再扣加量包。
 * 余额不足返回 null（调用方据此返回 40001）。
 *
 * 返回拆分而不是直接扣，是因为**退款必须按同样的拆分还回去**——
 * 把加量包次数错还成月度次数，会在月底重置时凭空蒸发。
 */
export function planSpend(balance: CreditBalance, cost: number): CreditSplit | null {
  if (balance.monthly + balance.addon < cost) return null;
  const monthly = Math.min(balance.monthly, cost);
  return { monthly, addon: cost - monthly };
}

export function applySpend(balance: CreditBalance, split: CreditSplit): CreditBalance {
  return {
    monthly: balance.monthly - split.monthly,
    addon: balance.addon - split.addon,
  };
}

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
 */
export function resolvePromptBehavior(prompt: string): PromptBehavior {
  const p = prompt.toLowerCase();
  if (p.includes("fail")) return { delayMs: 8000, outcome: "failed" };
  if (p.includes("slow")) return { delayMs: 90000, outcome: "succeeded" };
  if (p.includes("quick")) return { delayMs: 1000, outcome: "succeeded" };
  return { delayMs: 15000, outcome: "succeeded" };
}

// ─────────────────────────── 假数据 ───────────────────────────

export const MODELS: ImageModel[] = [
  { id: "flux-schnell", name: "Flux Schnell", credits: 1, supportsImageToImage: false },
  { id: "flux-pro", name: "Flux Pro", credits: 2, supportsImageToImage: true },
  { id: "nanobanana", name: "Nanobanana", credits: 3, supportsImageToImage: true },
];

export const ASPECT_RATIOS = ["1:1", "16:9", "9:16"] as const;

export const PLANS: Plan[] = [
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

export const ADDON_PACKS: AddonPack[] = [
  { id: "pack-100", credits: 100, priceUsd: 5 },
  { id: "pack-450", credits: 450, priceUsd: 20 },
  { id: "pack-1200", credits: 1200, priceUsd: 50 },
];

export const PLACEHOLDER_IMAGE_URL = "/placeholder-generation.svg";

// ─────────────────────── 内存状态（会随 dev server 重启丢失）───────────────────────

let balance: CreditBalance = { monthly: 12, addon: 3 };

export function getBalance(): CreditBalance {
  return { ...balance };
}

export function setBalance(next: CreditBalance): void {
  balance = { ...next };
}

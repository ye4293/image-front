/**
 * 这些类型对齐上游规格第 7 节的 API 契约。接入真实后端后本文件继续使用，
 * 因此**不得** import `lib/fixtures.ts`（那是本轮的假数据，将来会整体删除）。
 */

export type ImageModel = {
  id: string;
  name: string;
  credits: number;
  supportsImageToImage: boolean;
};

export type CreditBalance = {
  monthly: number;
  addon: number;
};

/** 扣费在两种余额上的拆分明细。退款必须按同样的拆分还回去。 */
export type CreditSplit = {
  monthly: number;
  addon: number;
};

export type Generation = {
  id: string;
  model: string;
  prompt: string;
  aspectRatio: string;
  status: "succeeded" | "failed";
  /** status 为 succeeded 时必有 */
  imageUrl?: string;
  /** status 为 failed 时必有 */
  error?: string;
  creditsSpent: number;
  createdAt: string;
};

export type Plan = {
  id: string;
  name: string;
  tagline: string;
  priceUsd: number;
  monthlyCredits: number;
  features: string[];
  highlighted: boolean;
};

export type AddonPack = {
  id: string;
  credits: number;
  priceUsd: number;
};

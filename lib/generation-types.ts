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

/**
 * 支持的画幅。类型定义在这里而不是从 `fixtures.ts` 的 `ASPECT_RATIOS` 派生，
 * 因为本文件不得 import fixtures；反向用 `satisfies` 约束那个数组，
 * 往数组里加一个这里没有的画幅会编译失败——drift 的方向正好被挡住。
 */
export type AspectRatio = "1:1" | "16:9" | "9:16";

type GenerationBase = {
  id: string;
  model: string;
  prompt: string;
  aspectRatio: AspectRatio;
  creditsSpent: number;
  createdAt: string;
};

/**
 * 按 `status` 判别的联合类型，而不是"`imageUrl?` 加一句注释说 succeeded 时必有"。
 * 注释编译器不执行：消费方在 `status === "succeeded"` 分支里拿到的仍是
 * `string | undefined`，只能写 `!` 或死分支。更要紧的是真实后端还有第三个状态
 * ——设计文档 §2.2 要求调上游前先落 `status=processing` 的行，`/history` 会展示
 * 卡住的 processing 行。给可选字段的形状加一个 `"processing"` 是静默通过的，
 * 而 `succeeded ? 图 : 错误` 会把卡住的行渲染成失败。联合类型强制每个消费方处理。
 *
 * 这**不是**换了 wire 格式：`{status:"succeeded", imageUrl:"..."}` 同样满足联合
 * 类型，只是把同一份 JSON 收窄了。本轮同步流程没有 `"processing"`，故暂不加，
 * 但结构上为它留好了强制处理的位置。
 */
export type Generation =
  | (GenerationBase & { status: "succeeded"; imageUrl: string })
  | (GenerationBase & { status: "failed"; error: string });

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

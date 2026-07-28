/**
 * 这些类型对齐上游规格第 7 节的 API 契约，与 Go 后端的响应字段一一对应
 * （后端侧 `internal/handler/models.go`、`internal/handler/generations.go`
 * 的注释反向指回本文件）。改这里就要同步改后端。
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

/**
 * 支持的画幅。
 *
 * 类型与数组放在一起并用 `satisfies` 相互约束：往数组里加一个联合类型里没有的
 * 画幅会编译失败。`satisfies` 而非 `:`，这样 `as const` 的字面量联合得以保留
 * （`ASPECT_RATIOS[number]` 仍是 `AspectRatio` 而不是 `string`）。
 *
 * 两者都必须与后端 `internal/generation/aspect.go` 的 `Dimensions` 支持的集合
 * 一致——后端对不支持的画幅回 40000 而**不**静默纠正成 1:1。
 */
export type AspectRatio = "1:1" | "16:9" | "9:16";

export const ASPECT_RATIOS = ["1:1", "16:9", "9:16"] as const satisfies readonly AspectRatio[];

type GenerationBase = {
  id: string;
  model: string;
  prompt: string;
  aspectRatio: AspectRatio;
  /**
   * 是否公开到画廊。对齐上游规格的 `generations.is_public` 列。
   *
   * 这个字段**必须**存在于类型与响应里，否则参数面板上那个 `aria-pressed` 开关
   * 就是个哑开关：UI 有状态、看起来能用、手工检查和 e2e 都发现不了，等真后端
   * 上线才有人问为什么没有一张图是公开的。而且没有任何东西读回它，连一个能抓到
   * 该缺陷的测试都写不出来——闭环靠 Handler 回传这个字段建立。
   */
  isPublic: boolean;
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

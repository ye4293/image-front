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

/**
 * 一个可订阅的档位，字段与后端 `GET /api/v1/plans` 的 `planResponse` 一一对应
 * （`internal/handler/plans.go`）。
 *
 * **刻意没有 stripe price id**：后端那个结构体是手写的输出映射而不是模型别名，
 * 就是为了不把 Price ID 交给客户端——否则客户端就参与决定了自己付多少钱。
 * 前端下单只传 `id`。
 *
 * 价格是**整数分**而不是美元浮点数：钱不做浮点运算，格式化时才除 100。
 *
 * 这里也**没有** `features` / `tagline` / `highlighted`：后端不返回它们。前端假
 * 数据里曾写过的功能差异点（优先排队 / 私密生成 / 商用授权 / 最高并发）一样都没
 * 实现，已删除——三档目前**只差每月次数**。要恢复差异化得先在后端有真东西。
 */
export type Plan = {
  id: string;
  displayName: string;
  priceUsdCents: number;
  monthlyCredits: number;
};

/**
 * 已知的订阅状态，沿用 Stripe 的词汇（后端原样落库并透传）。
 * 仅用于收窄**展示分支**，不用来给 `Subscription.status` 标类型——见下方注释。
 */
export const SUBSCRIPTION_STATUSES = ["active", "past_due", "canceled", "incomplete"] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

/**
 * `/me` 里的订阅摘要。**未订阅时整个对象是 `null`**（字段一定存在），前端靠 null
 * 区分"没订阅"与"订阅了但状态未知"——后端刻意用指针序列化成 null 就是为了这个
 * （`internal/handler/me.go`）。
 *
 * `status` 刻意声明成 `string` 而不是 `SubscriptionStatus`：这个值最终来自 Stripe
 * 的 webhook，而 Stripe 的状态不止我们列的四个（还有 `trialing`、`unpaid`、
 * `paused`…）。标成字面量联合等于向编译器承诺一件运行时保证不了的事，将来后端透传
 * 一个 `trialing` 过来，UI 就会走进"不可能发生"的分支。所以类型放宽，展示层用
 * `isSubscriptionStatus()` 显式收窄并给未知值兜底文案。
 */
export type Subscription = {
  planId: string;
  status: string;
  /** RFC3339 时间戳（Go time.Time 的序列化结果）。展示前必须 `new Date()` 再按语言格式化。 */
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
};

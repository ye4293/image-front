/**
 * 后台档位与模型配置的类型。与后端 `internal/handler/admin_plans.go` /
 * `admin_models.go` 的输出一一对应。
 */

/** 档位。字段名与后端 adminPlanResponse 对齐。 */
export type AdminPlan = {
  id: string;
  displayName: string;
  priceUsdCents: number;
  monthlyCredits: number;
  /** 空串表示还没跑过 cmd/seed-stripe——这是运营确认那一步做没做的唯一线索。 */
  stripePriceID: string;
  enabled: boolean;
  sortOrder: number;
};

/**
 * 档位里**可改**的字段。
 *
 * priceUsdCents 与 stripePriceID 刻意不在这里：后端 PATCH /admin/plans/:id 会**显式
 * 拒绝**它们（Stripe 的 Price 金额创建后不可变，改库里的价格只会让两边对不上，
 * 表现是"用户按旧价付款、系统按新价发额度"）。要调价必须新建 Price。
 *
 * 用一个独立的数组而不是让 UI 自己记得别渲染那两个输入框：漏一次就是一个静默的
 * 数据不一致源。
 */
export const EDITABLE_PLAN_KEYS = ["displayName", "monthlyCredits", "enabled", "sortOrder"] as const;

/** 模型。字段名与后端 adminModelResponse 对齐。 */
export type AdminModel = {
  id: string;
  displayName: string;
  provider: string;
  upstreamModel: string;
  /** 每次生成扣多少次数。必须 ≥ 1：扣费路径拒绝 cost <= 0。 */
  credits: number;
  enabled: boolean;
  sortOrder: number;
};

/**
 * 模型里**可改**的字段。
 *
 * provider 与 upstreamModel 不可改：generations 行按 id 引用模型，改掉上游模型会让
 * 事后对账把两批不同的结果混成同一个模型的。要换上游就新建一行、把旧行下架。
 */
export const EDITABLE_MODEL_KEYS = ["displayName", "credits", "enabled", "sortOrder"] as const;

/** 后端拒绝的扣费下限，与 internal/handler/admin_models.go 的 minModelCredits 一致。 */
export const MIN_MODEL_CREDITS = 1;

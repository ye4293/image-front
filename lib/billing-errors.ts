import {
  ERR_BAD_REQUEST,
  ERR_BILLING_NOT_CONFIGURED,
  ERR_NO_BILLING_ACCOUNT,
  ERR_PAYMENT_PROVIDER,
  ERR_PLAN_NOT_PURCHASABLE,
} from "@/lib/backend";

/**
 * 计费错误码 → `Billing` 命名空间下的词条键。
 *
 * **按接口分表，不做全局码表。** 后端在不同接口上复用了同一个码（40001 在
 * `/generations` 是余额不足、在 `/billing/portal` 是"还没有 Stripe customer"），
 * 一张全局表会把这两种情况映射到同一句文案，然后给一个从没结过账的用户显示
 * "次数不够"。所以调用方必须说明自己在问哪个接口。
 *
 * 为什么值得逐码分文案，而不是统一回一句"出错了"：这几种失败的**下一步动作完全
 * 不同**——50300/50301 是我们自己的部署没弄好，用户重试一万次也没用，只能等我们；
 * 40000 是他手上的页面过期了（档位被下架），刷新可能就好；50200 是暂时性故障，
 * 稍后重试有意义。全部塞成"出错了"会让第一类用户反复重试并开工单。
 */
export type BillingSurface = "checkout" | "portal";

/** 用户可见的兜底文案键。任何未列出的码都走这里，绝不把后端原文透给用户。 */
const GENERIC = "genericError";

export function billingErrorKey(code: number, surface: BillingSurface): string {
  switch (code) {
    case ERR_BILLING_NOT_CONFIGURED:
      return "notConfigured";
    case ERR_PLAN_NOT_PURCHASABLE:
      // 50301 只可能来自结账：Portal 不查档位。
      return surface === "checkout" ? "planNotReady" : GENERIC;
    case ERR_PAYMENT_PROVIDER:
      // 注意：这个码也可能是 BFF 自己合成的"连不上后端"（同值 50200，见
      // lib/backend.ts 的注释）。两种情况对用户是同一句话：稍后重试。
      return "providerUnavailable";
    case ERR_NO_BILLING_ACCOUNT:
      // 40001。**只在 Portal 上**是"没有账单账户"；结账路径上后端不会发这个码，
      // 真发了也不该复用那句文案。
      return surface === "portal" ? "noBillingAccount" : GENERIC;
    case ERR_BAD_REQUEST:
      // 结账时的 40000 = 未知或已下架的档位。用户的页面是旧的，刷新有意义。
      return surface === "checkout" ? "unknownPlan" : GENERIC;
    default:
      return GENERIC;
  }
}

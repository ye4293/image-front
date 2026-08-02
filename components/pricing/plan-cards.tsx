"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Plan } from "@/lib/generation-types";
import { billingErrorKey } from "@/lib/billing-errors";

/**
 * 金额一律从**整数分**格式化，不在别处存一份美元浮点数。
 *
 * 刻意用手写的 `$` 而不是 `Intl.NumberFormat(locale, {currency:"USD"})`：后者在
 * zh/ja/ko 下输出 `US$9.90`，而 Stripe 结账页显示的是 `$9.90`——同一笔钱两种写法
 * 会让人怀疑被多收。产品目前只以美元计价，真有多币种时再整体切到 Intl。
 */
function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** 每次多少钱。三位小数是刻意的：$0.050 与 $0.033 的差别在两位小数下会被抹平。 */
function perCredit(plan: Plan): string {
  return `$${(plan.priceUsdCents / 100 / plan.monthlyCredits).toFixed(3)}`;
}

/**
 * 单位价格最低的档位 id。
 *
 * 以前这里是假数据里写死的 `highlighted: true`（挂在 Pro 上）配一枚"最受欢迎"徽标
 * ——我们**没有任何**销量数据，那句是编的。改成用真实价格算出的"单位价格最划算"：
 * 同样起引导作用，但每个字都能被同一张卡上的数字验证。
 *
 * 并列时取第一个：徽标只是引导，不值得为并列再造一种展示。
 */
function bestValuePlanId(plans: readonly Plan[]): string | null {
  let best: Plan | null = null;
  for (const plan of plans) {
    // 防 0 除。后端不该存出这种行，但别让一行坏数据把徽标算到 Infinity 上去。
    if (plan.monthlyCredits <= 0) continue;
    if (
      best === null ||
      plan.priceUsdCents / plan.monthlyCredits < best.priceUsdCents / best.monthlyCredits
    ) {
      best = plan;
    }
  }
  return best?.id ?? null;
}

export function PlanCards({ plans, signedIn }: { plans: readonly Plan[]; signedIn: boolean }) {
  const t = useTranslations("Pricing");
  const tb = useTranslations("Billing");
  const router = useRouter();
  /** 正在结账的档位 id。存 id 而不是 boolean：三张卡的按钮要各自独立显示等待态。 */
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bestValue = bestValuePlanId(plans);

  /** 未登录（或 token 已过期）时的去处：登录完回到定价页继续。 */
  function goSignIn() {
    router.push({ pathname: "/login", query: { next: "/pricing" } });
  }

  async function subscribe(planId: string) {
    // **未登录绝不发起结账。** 未登录开出的 Checkout 会话没有可归属的用户，用户付完
    // 款我们不知道该给谁发次数，只能人工退款。BFF 路由那边也挡了一道（401），这里挡
    // 是为了给出"先登录"这个明确的下一步，而不是一句报错。
    if (!signedIn) {
      goSignIn();
      return;
    }

    setError(null);
    setPendingPlan(planId);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      if (res.status === 401) {
        // 本页是服务端渲染的，`signedIn` 可能已经不成立了（cookie 过期、别的标签页
        // 登出）。这不是错误，是要重新登录。
        goSignIn();
        return;
      }

      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const code =
          typeof body === "object" &&
          body !== null &&
          typeof (body as { code?: unknown }).code === "number"
            ? (body as { code: number }).code
            : 0;
        // 按码查词条，**不显示后端原文**：那是英文运维消息（"plan is not available
        // for purchase yet"），在四语界面里照原样显示等于没做 i18n。
        setError(tb(billingErrorKey(code, "checkout")));
        setPendingPlan(null);
        return;
      }

      const body: unknown = await res.json().catch(() => null);
      const url =
        typeof body === "object" &&
        body !== null &&
        typeof (body as { checkoutUrl?: unknown }).checkoutUrl === "string"
          ? (body as { checkoutUrl: string }).checkoutUrl
          : null;
      if (!url) {
        setError(tb("genericError"));
        setPendingPlan(null);
        return;
      }
      // Stripe 的域名，必须整页跳转——`router.push` 只认站内路由，喂外链会得到一次
      // 404 软导航。也**不复位 pending**：跳转已经在路上，把按钮放开只会让用户在等待
      // 期间再点一次、多开一个 Checkout 会话。
      window.location.assign(url);
    } catch {
      // **必须有 catch。** fetch 只在网络层失败时 reject（离线、DNS、服务端重启）。
      // 不接住的话 rejection 会从事件处理器逃逸成 unhandled rejection——React 不显示、
      // error.tsx 也接不到，用户只看见按钮闪一下就复原，与没点过一模一样。本仓库在
      // AuthForm 上真出过这个 bug（见 components/auth-form.tsx 的注释）。
      setError(tb("networkError"));
      setPendingPlan(null);
    }
  }

  return (
    <div className="px-6 pb-8">
      {error && (
        <p
          role="alert"
          data-testid="billing-error"
          className="mb-4 rounded-md border border-danger/30 bg-danger-tint p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {/* 手机上单列纵向堆叠（默认），≥768px 三列并排。 */}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const highlighted = plan.id === bestValue;
          const pending = pendingPlan === plan.id;
          return (
            <div
              key={plan.id}
              data-testid={`plan-${plan.id}`}
              className={`relative rounded-xl border p-5 ${
                highlighted ? "border-2 border-foreground shadow-lg" : ""
              }`}
            >
              {highlighted && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-2.5 py-0.5 text-[10px] font-semibold text-background">
                  {t("bestValue")}
                </span>
              )}
              {/* displayName 来自后端 plans 表，是**数据**而不是界面文案，因此不进词条。
                  按语言返回档位名是后端的事（要加 plan_translations 之类的表）；在那
                  之前它在任何界面语言下都显示库里存的值。 */}
              <h3 className="text-sm font-semibold">{plan.displayName}</h3>
              <p className="mt-3">
                <span className="text-3xl font-semibold">{formatUsd(plan.priceUsdCents)}</span>
                <span className="text-xs text-muted-foreground">{t("perMonth")}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("creditsLine", { credits: plan.monthlyCredits, perCredit: perCredit(plan) })}
              </p>
              <button
                type="button"
                data-testid={`subscribe-${plan.id}`}
                onClick={() => subscribe(plan.id)}
                // 只禁用**正在结账的那一张**。整组一起禁用会让用户以为自己点错了档位。
                disabled={pending}
                className={`mt-4 w-full rounded-md border py-2 text-xs font-semibold ${
                  highlighted ? "bg-foreground text-background" : ""
                } disabled:opacity-60`}
              >
                {pending ? t("redirecting") : t("choose", { plan: plan.displayName })}
              </button>
              {/* 三档**只差每月次数**。以前这里列着"优先排队 / 私密生成 / 商用授权 /
                  最高并发"——一样都没实现，留着就是虚假宣传，已删除。要再加差异点，
                  先让后端真有那个能力。 */}
              <p className="mt-4 text-xs text-muted-foreground">{t("sameFeatures")}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

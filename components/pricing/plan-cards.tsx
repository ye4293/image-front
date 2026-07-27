import { useTranslations } from "next-intl";
import type { Plan } from "@/lib/generation-types";

function perCredit(plan: Plan): string {
  return `$${(plan.priceUsd / plan.monthlyCredits).toFixed(3)}`;
}

export function PlanCards({ plans }: { plans: readonly Plan[] }) {
  const t = useTranslations("Pricing");
  return (
    <div className="grid gap-4 px-6 pb-8 md:grid-cols-3">
      {plans.map((plan) => (
        <div
          key={plan.id}
          data-testid={`plan-${plan.id}`}
          className={`relative rounded-xl border p-5 ${
            plan.highlighted ? "border-2 border-foreground shadow-lg" : ""
          }`}
        >
          {plan.highlighted && (
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-2.5 py-0.5 text-[10px] font-semibold text-background">
              {t("mostPopular")}
            </span>
          )}
          {/* plan.name / plan.tagline / plan.features 全部来自后端 plans 表（本轮是
              fixtures 里的假数据），是**数据**而不是界面文案，因此不进词条。
              本地化套餐文案是后端的事——见 lib/fixtures.ts 上方注释。 */}
          <h3 className="text-sm font-semibold">{plan.name}</h3>
          <p className="mt-1 min-h-8 text-xs text-muted-foreground">{plan.tagline}</p>
          <p className="mt-3">
            <span className="text-3xl font-semibold">${plan.priceUsd}</span>
            <span className="text-xs text-muted-foreground">{t("perMonth")}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("creditsLine", {
              credits: plan.monthlyCredits,
              perCredit: perCredit(plan),
            })}
          </p>
          <button
            type="button"
            disabled
            title={t("stripePending")}
            className={`mt-4 w-full rounded-md border py-2 text-xs font-semibold ${
              plan.highlighted ? "bg-foreground text-background" : ""
            } disabled:opacity-60`}
          >
            {t("choose", { plan: plan.name })}
          </button>
          <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            {plan.features.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

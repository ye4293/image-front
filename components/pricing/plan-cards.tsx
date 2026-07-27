import type { Plan } from "@/lib/generation-types";

function perCredit(plan: Plan): string {
  return `$${(plan.priceUsd / plan.monthlyCredits).toFixed(3)}`;
}

export function PlanCards({ plans }: { plans: readonly Plan[] }) {
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
              MOST POPULAR
            </span>
          )}
          <h3 className="text-sm font-semibold">{plan.name}</h3>
          <p className="mt-1 min-h-8 text-xs text-muted-foreground">{plan.tagline}</p>
          <p className="mt-3">
            <span className="text-3xl font-semibold">${plan.priceUsd}</span>
            <span className="text-xs text-muted-foreground"> /month</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {plan.monthlyCredits} 次 / 月 · 约 {perCredit(plan)} 每次
          </p>
          <button
            type="button"
            disabled
            title="Stripe 尚未接入"
            className={`mt-4 w-full rounded-md border py-2 text-xs font-semibold ${
              plan.highlighted ? "bg-foreground text-background" : ""
            } disabled:opacity-60`}
          >
            Choose {plan.name}
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

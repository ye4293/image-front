import { ADDON_PACKS, PLANS } from "@/lib/fixtures";
import { PlanCards } from "@/components/pricing/plan-cards";
import { AddonPacks } from "@/components/pricing/addon-packs";

export const metadata = { title: "Pricing · Image Studio" };

export default function PricingPage() {
  return (
    <div>
      <div className="px-6 py-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Simple, usage-based pricing</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every plan includes all models. Cancel anytime.
        </p>
      </div>
      <PlanCards plans={PLANS} />
      <AddonPacks packs={ADDON_PACKS} />
    </div>
  );
}

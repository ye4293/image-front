import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ADDON_PACKS, PLANS } from "@/lib/plans";
import { PlanCards } from "@/components/pricing/plan-cards";
import { AddonPacks } from "@/components/pricing/addon-packs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("pricingTitle") };
}

export default async function PricingPage() {
  const t = await getTranslations("Pricing");
  return (
    <div>
      <div className="px-6 py-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PlanCards plans={PLANS} />
      <AddonPacks packs={ADDON_PACKS} />
    </div>
  );
}

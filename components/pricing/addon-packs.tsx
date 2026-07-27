import { useTranslations } from "next-intl";
import type { AddonPack } from "@/lib/generation-types";

export function AddonPacks({ packs }: { packs: readonly AddonPack[] }) {
  const t = useTranslations("Pricing");
  return (
    <>
      <section className="border-t bg-muted/30 px-6 py-7">
        <h2 className="text-sm font-semibold">{t("addonsTitle")}</h2>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">
          {/* 用 t.rich 而不是把句子切成三段拼起来：各语言的强调位置与语序都不同，
              拼接会强制所有语言照抄英文/中文的分句方式。 */}
          {t.rich("addonsSubtitle", { b: (chunks) => <strong>{chunks}</strong> })}
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {packs.map((pack) => (
            <div
              key={pack.id}
              data-testid={`addon-${pack.id}`}
              className="flex items-center justify-between rounded-lg border bg-background p-3"
            >
              <div>
                <p className="text-sm font-semibold">{t("addonCredits", { credits: pack.credits })}</p>
                <p className="text-[10px] text-muted-foreground">
                  {t("addonPerCredit", {
                    price: `$${(pack.priceUsd / pack.credits).toFixed(3)}`,
                  })}
                </p>
              </div>
              <button
                type="button"
                disabled
                title={t("stripePending")}
                className="rounded-md border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              >
                ${pack.priceUsd}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/*
        这一段单独成块、用大白话写，不塞进 FAQ。
        "月度重置 / 加量包不过期 / 先扣月度"这三条若不讲清楚，
        用户看到余额变化会认为被多扣——这是最容易产生工单与差评之处。
      */}
      <section className="border-t px-6 py-6">
        <h2 className="mb-2 text-sm font-semibold">{t("explainerTitle")}</h2>
        <div className="max-w-2xl space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <p>
            {t.rich("explainerMonthly", {
              b: (chunks) => <strong>{chunks}</strong>,
              u: (chunks) => <u>{chunks}</u>,
            })}
          </p>
          <p>
            {t.rich("explainerAddon", {
              b: (chunks) => <strong>{chunks}</strong>,
              u: (chunks) => <u>{chunks}</u>,
            })}
          </p>
          <p>{t.rich("explainerOrder", { b: (chunks) => <strong>{chunks}</strong> })}</p>
        </div>
      </section>
    </>
  );
}

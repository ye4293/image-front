import { useTranslations } from "next-intl";

/**
 * 双余额说明（月度 vs 加量包）。
 *
 * 这个组件以前叫 `AddonPacks`，并渲染三张可购买的加量包卡片（100/450/1200 次）。
 * 那三张卡的价格是写在 `lib/plans.ts` 里的**假数据**：后端没有 addon_packs 表、没有
 * 接口、按钮从来是 `disabled`。随该文件一起删掉了——摆一张买不到的价目表，比不摆更糟，
 * 用户会按那个单价去算划不划算，而它可能和 M4b 真上线时的价格不一样。
 *
 * 说明文字**留着**，因为它讲的东西已经是真的：加量包次数在后端真实存在
 * （`credit_ledger` 里的 addon 余额，管理员可发放），扣费顺序也确实是先月度后加量包。
 */
export function CreditExplainer() {
  const t = useTranslations("Pricing");
  return (
    <>
      <section className="border-t bg-muted/30 px-6 py-7">
        <h2 className="text-sm font-semibold">{t("addonsTitle")}</h2>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground" data-testid="addons-coming-soon">
          {t("addonsComingSoon")}
        </p>
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
            {/* 用 t.rich 而不是把句子切成三段拼起来：各语言的强调位置与语序都不同，
                拼接会强制所有语言照抄英文/中文的分句方式。 */}
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

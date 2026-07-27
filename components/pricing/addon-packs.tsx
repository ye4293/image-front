import type { AddonPack } from "@/lib/generation-types";

export function AddonPacks({ packs }: { packs: readonly AddonPack[] }) {
  return (
    <>
      <section className="border-t bg-muted/30 px-6 py-7">
        <h2 className="text-sm font-semibold">次数不够用？加量包</h2>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">
          一次性购买，<strong>永不过期</strong>。需要有效订阅才能购买。
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {packs.map((pack) => (
            <div
              key={pack.id}
              data-testid={`addon-${pack.id}`}
              className="flex items-center justify-between rounded-lg border bg-background p-3"
            >
              <div>
                <p className="text-sm font-semibold">{pack.credits} 次</p>
                <p className="text-[10px] text-muted-foreground">
                  ${(pack.priceUsd / pack.credits).toFixed(3)} 每次
                </p>
              </div>
              <button
                type="button"
                disabled
                title="Stripe 尚未接入"
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
        <h2 className="mb-2 text-sm font-semibold">月度次数和加量包次数有什么区别？</h2>
        <div className="max-w-2xl space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <p>
            <strong>月度次数</strong>随订阅每月<u>重置</u>——用不完不累积到下月。
          </p>
          <p>
            <strong>加量包次数</strong>一次性购买，<u>永不过期</u>，取消订阅后仍然保留。
          </p>
          <p>
            生成时<strong>优先扣月度次数</strong>，月度用尽才动加量包——所以加量包不会被&ldquo;月底清零&rdquo;白白浪费。
          </p>
        </div>
      </section>
    </>
  );
}

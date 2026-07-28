import type { AddonPack, Plan } from "@/lib/generation-types";

/**
 * **本仓库唯一残留的假数据。**
 *
 * 其余一切（模型列表、余额、生成）都已经接到 Go 后端，`lib/fixtures.ts` 整体删除。
 * 套餐与加量包留在前端，是因为它们背后的东西还不存在：Stripe 未接入，后端没有
 * `plans` 表、没有 `GET /api/v1/plans`、没有订阅状态。为这些行造一张后端表只是把
 * 同一份写死的数据搬个地方，还得连带发明一套"价格从哪来"的假象——定价页上的按钮
 * 至今是 `disabled`，配的 title 就是"Stripe 尚未接入"。
 *
 * 接 Stripe（M4）时：把这里的三档与三个加量包搬进后端 `plans` / `addon_packs`
 * 表，`GET /api/v1/plans` 按请求语言返回文案，然后删掉本文件。
 *
 * 常量全部 readonly：Next.js 里模块级值是**进程级**的，跨请求共享。一个组件里顺手
 * 写个 `PLANS.sort(...)` 就会永久改掉所有后续请求看到的顺序。
 */

/**
 * `name` / `tagline` / `features` 刻意**不进 messages/ 词条**。
 *
 * 它们建模的是后端 `plans` 表里的行，是**数据**而不是界面文案。搬进词条等于假装
 * 后端返回的是本地化文本——而它并不是：接上真后端后这些字段直接来自数据库，
 * 词条里的译文会被静默忽略，只剩一份永远对不上的死副本。
 *
 * 因此本地化套餐文案是**后端的工作**：`plans` 表需要加按语言的列
 * （`tagline_en` / `tagline_zh` / …）或一张 `plan_translations` 关联表，
 * 并让 `GET /api/v1/plans` 按请求语言返回对应文案。在那之前，这三个字段
 * 在任何界面语言下都显示这里写死的内容（当前是英文档位名 + 中文 features）。
 */
export const PLANS: readonly Readonly<Plan>[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Trying things out",
    priceUsd: 9,
    monthlyCredits: 200,
    features: ["全部模型", "图生图", "历史记录", "可购加量包"],
    highlighted: false,
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Regular creative work",
    priceUsd: 29,
    monthlyCredits: 800,
    features: ["Starter 全部内容", "生成优先排队", "私密生成", "商用授权"],
    highlighted: true,
  },
  {
    id: "max",
    name: "Max",
    tagline: "High volume / teams",
    priceUsd: 99,
    monthlyCredits: 3000,
    features: ["Pro 全部内容", "最高并发", "优先支持"],
    highlighted: false,
  },
];

export const ADDON_PACKS: readonly Readonly<AddonPack>[] = [
  { id: "pack-100", credits: 100, priceUsd: 5 },
  { id: "pack-450", credits: 450, priceUsd: 20 },
  { id: "pack-1200", credits: 1200, priceUsd: 50 },
];

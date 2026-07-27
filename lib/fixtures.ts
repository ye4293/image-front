/**
 * 本轮的假数据与内存状态。接入真实后端时**整体删除本文件**。
 *
 * 上半部分是纯函数（可单测），下半部分是模块级可变状态（不可单测，
 * 由端到端测试覆盖）。两者刻意分开。
 */

import type {
  AddonPack,
  AspectRatio,
  CreditBalance,
  CreditSplit,
  ImageModel,
  Plan,
} from "@/lib/generation-types";

// ─────────────────────────── 纯函数 ───────────────────────────

/**
 * 计算一次扣费在两种余额上的拆分：先扣月度，不够再扣加量包。
 * 余额不足返回 null（调用方据此返回 40001）。
 *
 * 返回拆分而不是直接扣，是因为**退款必须按同样的拆分还回去**——
 * 把加量包次数错还成月度次数，会在月底重置时凭空蒸发。
 */
export function planSpend(balance: CreditBalance, cost: number): CreditSplit | null {
  // cost 必须是正整数。负数会凭空造出次数（min(5,-5) === -5 然后被"退"回余额），
  // 非整数会让退款的浮点往返不精确。后端的条件原子更新同样要守这条前置条件。
  if (!Number.isInteger(cost) || cost <= 0) return null;
  if (balance.monthly + balance.addon < cost) return null;
  const monthly = Math.min(balance.monthly, cost);
  return { monthly, addon: cost - monthly };
}

/**
 * 前置条件：`split` **必须**来自针对同一份 `balance` 的 `planSpend`。拿别处的
 * 拆分来扣会扣出负余额。另注意 `CreditSplit` 与 `CreditBalance` 结构完全相同，
 * 两个参数写反了编译器不报错——顺序是 (余额, 拆分)。
 */
export function applySpend(balance: CreditBalance, split: CreditSplit): CreditBalance {
  return {
    monthly: balance.monthly - split.monthly,
    addon: balance.addon - split.addon,
  };
}

/**
 * 前置条件：`split` **必须**是当初 `applySpend` 用的那一份，否则就会把加量包
 * 次数错还成月度次数（月底重置时凭空蒸发）。参数顺序同样是 (余额, 拆分)，
 * 结构相同故写反了不报错。
 */
export function applyRefund(balance: CreditBalance, split: CreditSplit): CreditBalance {
  return {
    monthly: balance.monthly + split.monthly,
    addon: balance.addon + split.addon,
  };
}

export type PromptBehavior = {
  delayMs: number;
  outcome: "succeeded" | "failed";
};

/**
 * 用 prompt 关键词做**确定性**触发，不用随机——随机的失败路径无法稳定复现，
 * 也没法写自动化测试。
 *
 * 优先级：fail > slow > quick > 默认。
 *
 * 匹配是**子串匹配**且不区分大小写：`"failure"`、`"slowly"`、`"quickly"` 都会
 * 触发。这是刻意的（好记、好在 e2e 里构造），但代价是 "a failing bridge at
 * sunset" 会秒失败——撞上时那是设计，不是 bug。
 */
export function resolvePromptBehavior(prompt: string): PromptBehavior {
  const p = prompt.toLowerCase();
  if (p.includes("fail")) return { delayMs: 8000, outcome: "failed" };
  if (p.includes("slow")) return { delayMs: 90000, outcome: "succeeded" };
  if (p.includes("quick")) return { delayMs: 1000, outcome: "succeeded" };
  return { delayMs: 15000, outcome: "succeeded" };
}

// ─────────────────────────── 假数据 ───────────────────────────

// 这些常量全部 readonly：Next.js 里模块级值是**进程级**的，跨请求共享。
// 一个组件里顺手写个 `PLANS.sort(...)` 就会永久改掉所有后续请求看到的顺序。

export const MODELS: readonly Readonly<ImageModel>[] = [
  { id: "flux-schnell", name: "Flux Schnell", credits: 1, supportsImageToImage: false },
  { id: "flux-pro", name: "Flux Pro", credits: 2, supportsImageToImage: true },
  { id: "nanobanana", name: "Nanobanana", credits: 3, supportsImageToImage: true },
];

/** `satisfies` 而非 `:`，这样 `as const` 的字面量联合得以保留，同时被 `AspectRatio` 约束。 */
export const ASPECT_RATIOS = ["1:1", "16:9", "9:16"] as const satisfies readonly AspectRatio[];

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

export const PLACEHOLDER_IMAGE_URL = "/placeholder-generation.svg";

// ─────────────────────── 内存状态（会随 dev server 重启丢失）───────────────────────

/**
 * 初始值刻意设成 12 + 3 = 15 次：用 Flux Pro（2 次/张）点 6 次后月度只剩 0，
 * 第 7 次跨过月度耗尽、开始扣加量包，第 8 次余额不足弹升级框。
 * **手工点几下就能走到所有边界，不用改代码造数据**——不要为了图省事改成 100，
 * 那样端到端场景 3（余额不足）就得点 50 次。
 *
 * 提成常量供 `resetBalance()` 复用：两处硬编码同一份初始值必然漂移，
 * 而漂移的症状是端到端测试的相对余额断言莫名其妙地时好时坏。
 */
const INITIAL_BALANCE: CreditBalance = { monthly: 12, addon: 3 };

/**
 * 状态挂在 `globalThis` 上，而不是普通的模块级 `let`。
 *
 * 原因：Next 的打包会为不同执行图（RSC 图与 Route Handler 图）产生**同一模块的
 * 不同实例**，dev 的热更新也会重新求值模块。用普通 `let` 时，顶栏徽标（Server
 * Component 直接读 fixtures）与 `/api/credits`（Route Handler）有可能各自持有一份
 * 余额，于是生成明明扣了费、徽标却纹丝不动。实施期间已观察到一次这种分裂
 * （生成接口正常扣到 402，`/api/credits` 始终返回初始值），复现不稳定。
 *
 * 症状会被当成"扣费逻辑坏了"，让人去翻 `mutateBalance`——而那部分是对的。
 * 挂 globalThis 让所有实例共用一份，是 Next.js 里进程级单例的标准做法
 * （与 Prisma client 的 global 模式同源）。本文件将来整体删除，这段一起消失。
 */
const store = globalThis as typeof globalThis & {
  __imageFrontBalance?: CreditBalance;
};

store.__imageFrontBalance ??= { ...INITIAL_BALANCE };

function currentBalance(): CreditBalance {
  return store.__imageFrontBalance ?? { ...INITIAL_BALANCE };
}

/** 只读快照。返回副本，调用方改它不会影响进程级状态。 */
export function getBalance(): CreditBalance {
  return { ...currentBalance() };
}

/**
 * 把余额恢复到初始值。**仅供端到端测试的前置准备使用**（`e2e/global-setup.ts`
 * 经 `POST /api/credits/reset` 调用）。
 *
 * 存在的理由：余额是进程级模块状态，本身没有任何重置路径，而 Playwright 默认
 * 复用已有 dev server。端到端场景 3 故意把余额耗尽来触发升级弹窗，于是**第二次**
 * 跑测试时，场景 1（正常出图 + 余额减少）从被抽干的余额开始，直接拿到 402 弹窗
 * 而不是结果图。`workers: 1` 防得住同次运行内的竞争，防不住跨次残留。
 */
export function resetBalance(): CreditBalance {
  store.__imageFrontBalance = { ...INITIAL_BALANCE };
  return { ...store.__imageFrontBalance };
}

/**
 * 读—改—写余额。**必须**通过本函数修改，不要暴露独立的 setter。
 *
 * 原因：Node 单线程下，`读 → 计算 → 写` 只在中间没有 `await` 时才是原子的。
 * 如果调用方自己持有旧余额、await 一个耗时操作、再写回去，并发请求会静默
 * 丢失一次扣费。把整个序列锁在一个同步回调里，这个窗口就不可能被拉开。
 */
export function mutateBalance(fn: (current: CreditBalance) => CreditBalance): CreditBalance {
  store.__imageFrontBalance = { ...fn({ ...currentBalance() }) };
  return { ...store.__imageFrontBalance };
}

# M2 前端：生成工作台与定价页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在后端生成接口就绪前，用假数据 Route Handler 驱动出可交互的 `/generate` 工作台与 `/pricing` 定价页，让加载、失败、余额不足这些最易出 bug 的状态从第一天就真实运行。

**Architecture:** 沿用 M1 的 BFF 模式——浏览器只与 Next 同源通信，新增的 `app/api/{models,plans,credits,generations}` Route Handler 返回写死数据。生成接口**同步**返回结果 URL（上游 ezlinkai 对图像是同步的，最慢约 3 分钟），没有轮询。接入真实后端时只改这四个 Handler 内部，组件与测试不动。

**Tech Stack:** Next.js 16.2.12（Middleware 已改名 `proxy.ts`）+ TypeScript + Tailwind v4 + shadcn/ui v4.15.0（基于 `@base-ui/react`）+ Vitest + Playwright。

**设计文档：** `docs/superpowers/specs/2026-07-27-m2-frontend-workbench-pricing-design.md`

**起点：** 从 `main`（HEAD `2c242a0`）切出特性分支 `m2-frontend-workbench-pricing`。现有 39 个单测、4 条 e2e 全绿。

---

## 动手前必读：M1 用代价换来的三条铁律

违反任何一条都会被代码审查打回。这些不是风格偏好，每条背后都有一个已经发生过的缺陷。

**1. 所有客户端 `fetch` 必须带 `catch`。**
`fetch` 只在网络层失败时 reject（离线、DNS 失败、服务端中途重启、请求被 abort）。不接住的话，rejection 会从事件处理器里逃逸成 unhandled rejection——React 不显示它，`app/error.tsx` 也接不到，用户只看见按钮闪一下就恢复原样，与没点过完全一样，然后一直点。M1 的登录表单就是这么坏的。

**2. 成功后不要复位 pending 状态。**
`router.push`/`replace` 只是把导航派发出去，目标路由的数据还在飞。此时把按钮重新启用，用户可以二次提交。保持禁用直到组件被卸载。

**3. 导航链接不得用 `<Button render={<Link/>}>`。**
Base UI 的 Button 在 `nativeButton={false}` 时会**强制写上 `role="button"`**，渲染成 `<a role="button" href>`——会跳页的链接被屏幕阅读器播报成按钮。正确写法是 `<Link className={buttonVariants({ variant: "ghost" })}>`。`e2e/auth.spec.ts` 里有一条 `role=link` 断言守着这点，改回去会立刻失败。

**4. Next 16 与你的记忆不符之处：** 根目录中间件文件叫 `proxy.ts`、导出函数叫 `proxy`；`cookies()` 与页面 `searchParams` 都是 async 必须 `await`。遇到不确定的 API，查 `node_modules/next/dist/docs/`，不要凭印象写。

---

## File Structure

```
app/
  generate/page.tsx                    工作台页（Server Component，取模型列表与余额）
  pricing/page.tsx                     定价页（Server Component，取套餐）
  api/
    models/route.ts                    GET 模型列表
    plans/route.ts                     GET 套餐与加量包
    credits/route.ts                   GET 当前余额
    generations/route.ts               POST 提交生成（同步返回）
components/
  generate/
    workbench.tsx                      客户端状态容器 + 左右布局壳
    param-panel.tsx                    模型·比例·参考图·prompt·生成按钮
    model-selector.tsx                 原生 select，选项标注消耗次数
    result-panel.tsx                   骨架/秒数计数/结果图/失败提示/最近生成条
    insufficient-credits-dialog.tsx    余额不足引导
  pricing/
    plan-cards.tsx                     三张套餐卡
    addon-packs.tsx                    加量包 + 双余额说明
  credit-badge.tsx                     顶栏余额徽标
lib/
  generation-types.ts                  类型定义，不 import fixtures
  fixtures.ts                          假数据 + 扣费纯函数 + 内存状态
public/
  placeholder-generation.svg           假的生成结果图（本地文件，不依赖网络）
tests/
  fixtures.test.ts                     扣费纯函数单测
e2e/
  generate.spec.ts                     工作台端到端
```

**职责边界：** `lib/fixtures.ts` 是唯一持有假数据与内存状态的模块，接真后端时整体删除；`lib/generation-types.ts` 在那之后继续使用，**因此它绝不能 import `fixtures.ts`**（反向可以）。

---

## Task 1: 类型定义与扣费纯函数（TDD）

**Files:**
- Create: `lib/generation-types.ts`
- Create: `lib/fixtures.ts`
- Test: `tests/fixtures.test.ts`

这是整个里程碑的地基，也是唯一有真实逻辑值得单测的部分。扣费的**双余额拆分**要在这里定死：先扣月度、月度不够再扣加量包，且**扣的时候就记下拆分明细**——退款要按同样的拆分还回去，否则会把加量包次数错还成月度次数，月底重置时凭空蒸发。真实后端的 `credit_transactions` 也要记这个拆分，所以这里的设计是给后端打样。

> **不要实现退款幂等去重。** 同步模式下退款发生在与扣费同一个请求内部，没有任何外部途径能重复触发，写幂等代码和测试等于覆盖不可达路径。幂等真正必需的地方是后端启动时扫 `processing` 行的兜底退款（扫两次会退两次），那属于后端职责，届时以"该 generation 无 refund 流水"为幂等条件实现。

- [ ] **Step 1: 写类型定义**

`lib/generation-types.ts`：

```ts
/**
 * 这些类型对齐上游规格第 7 节的 API 契约。接入真实后端后本文件继续使用，
 * 因此**不得** import `lib/fixtures.ts`（那是本轮的假数据，将来会整体删除）。
 */

export type ImageModel = {
  id: string;
  name: string;
  credits: number;
  supportsImageToImage: boolean;
};

export type CreditBalance = {
  monthly: number;
  addon: number;
};

/** 扣费在两种余额上的拆分明细。退款必须按同样的拆分还回去。 */
export type CreditSplit = {
  monthly: number;
  addon: number;
};

export type Generation = {
  id: string;
  model: string;
  prompt: string;
  aspectRatio: string;
  status: "succeeded" | "failed";
  /** status 为 succeeded 时必有 */
  imageUrl?: string;
  /** status 为 failed 时必有 */
  error?: string;
  creditsSpent: number;
  createdAt: string;
};

export type Plan = {
  id: string;
  name: string;
  tagline: string;
  priceUsd: number;
  monthlyCredits: number;
  features: string[];
  highlighted: boolean;
};

export type AddonPack = {
  id: string;
  credits: number;
  priceUsd: number;
};
```

- [ ] **Step 2: 写失败的测试**

`tests/fixtures.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { planSpend, applySpend, applyRefund } from "@/lib/fixtures";
import type { CreditBalance } from "@/lib/generation-types";

const balance = (monthly: number, addon: number): CreditBalance => ({ monthly, addon });

describe("planSpend", () => {
  it("月度余额充足时只扣月度", () => {
    expect(planSpend(balance(10, 5), 3)).toEqual({ monthly: 3, addon: 0 });
  });

  it("月度不足时先扣光月度再扣加量包", () => {
    expect(planSpend(balance(2, 10), 5)).toEqual({ monthly: 2, addon: 3 });
  });

  it("月度为零时全扣加量包", () => {
    expect(planSpend(balance(0, 10), 4)).toEqual({ monthly: 0, addon: 4 });
  });

  it("总额恰好等于所需时通过（边界）", () => {
    expect(planSpend(balance(2, 3), 5)).toEqual({ monthly: 2, addon: 3 });
  });

  it("总额差一时返回 null（边界）", () => {
    expect(planSpend(balance(2, 2), 5)).toBeNull();
  });

  it("两种余额都为零时返回 null", () => {
    expect(planSpend(balance(0, 0), 1)).toBeNull();
  });
});

describe("applySpend / applyRefund", () => {
  it("扣费后余额按拆分减少", () => {
    const split = { monthly: 2, addon: 3 };
    expect(applySpend(balance(2, 10), split)).toEqual({ monthly: 0, addon: 7 });
  });

  it("退款把余额精确还原", () => {
    const before = balance(2, 10);
    const split = planSpend(before, 5)!;
    const after = applySpend(before, split);
    expect(applyRefund(after, split)).toEqual(before);
  });

  it("退款按原拆分还回，不会把加量包次数错还成月度", () => {
    // 月度 1 + 加量包 4 = 扣 5，退款必须还回 1 月度 + 4 加量包，
    // 而不是 5 月度——后者会在月底重置时凭空蒸发 4 次。
    const before = balance(1, 10);
    const split = planSpend(before, 5)!;
    expect(split).toEqual({ monthly: 1, addon: 4 });
    const after = applySpend(before, split);
    expect(applyRefund(after, split)).toEqual({ monthly: 1, addon: 10 });
  });

  it("扣费与退款都不修改传入对象（纯函数）", () => {
    const before = balance(5, 5);
    const split = planSpend(before, 3)!;
    applySpend(before, split);
    applyRefund(before, split);
    expect(before).toEqual({ monthly: 5, addon: 5 });
  });
});

describe("resolvePromptBehavior", () => {
  it("普通 prompt 15 秒后成功", async () => {
    const { resolvePromptBehavior } = await import("@/lib/fixtures");
    expect(resolvePromptBehavior("a cat astronaut")).toEqual({ delayMs: 15000, outcome: "succeeded" });
  });

  it("含 fail 的 prompt 8 秒后失败", async () => {
    const { resolvePromptBehavior } = await import("@/lib/fixtures");
    expect(resolvePromptBehavior("please fail this")).toEqual({ delayMs: 8000, outcome: "failed" });
  });

  it("含 slow 的 prompt 90 秒后成功", async () => {
    const { resolvePromptBehavior } = await import("@/lib/fixtures");
    expect(resolvePromptBehavior("a slow sunset")).toEqual({ delayMs: 90000, outcome: "succeeded" });
  });

  it("含 quick 的 prompt 1 秒后成功（供端到端测试用）", async () => {
    const { resolvePromptBehavior } = await import("@/lib/fixtures");
    expect(resolvePromptBehavior("quick test")).toEqual({ delayMs: 1000, outcome: "succeeded" });
  });

  it("关键词匹配不区分大小写", async () => {
    const { resolvePromptBehavior } = await import("@/lib/fixtures");
    expect(resolvePromptBehavior("FAIL NOW").outcome).toBe("failed");
  });

  it("fail 的优先级高于 quick", async () => {
    const { resolvePromptBehavior } = await import("@/lib/fixtures");
    expect(resolvePromptBehavior("quick fail").outcome).toBe("failed");
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
npm test
```

期望：FAIL，报无法解析 `@/lib/fixtures`。

- [ ] **Step 4: 实现 lib/fixtures.ts**

```ts
import type {
  AddonPack,
  CreditBalance,
  CreditSplit,
  ImageModel,
  Plan,
} from "@/lib/generation-types";

/**
 * 本轮的假数据与内存状态。接入真实后端时**整体删除本文件**。
 *
 * 上半部分是纯函数（可单测），下半部分是模块级可变状态（不可单测，
 * 由端到端测试覆盖）。两者刻意分开。
 */

// ─────────────────────────── 纯函数 ───────────────────────────

/**
 * 计算一次扣费在两种余额上的拆分：先扣月度，不够再扣加量包。
 * 余额不足返回 null（调用方据此返回 40001）。
 *
 * 返回拆分而不是直接扣，是因为**退款必须按同样的拆分还回去**——
 * 把加量包次数错还成月度次数，会在月底重置时凭空蒸发。
 */
export function planSpend(balance: CreditBalance, cost: number): CreditSplit | null {
  if (balance.monthly + balance.addon < cost) return null;
  const monthly = Math.min(balance.monthly, cost);
  return { monthly, addon: cost - monthly };
}

export function applySpend(balance: CreditBalance, split: CreditSplit): CreditBalance {
  return {
    monthly: balance.monthly - split.monthly,
    addon: balance.addon - split.addon,
  };
}

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
 */
export function resolvePromptBehavior(prompt: string): PromptBehavior {
  const p = prompt.toLowerCase();
  if (p.includes("fail")) return { delayMs: 8000, outcome: "failed" };
  if (p.includes("slow")) return { delayMs: 90000, outcome: "succeeded" };
  if (p.includes("quick")) return { delayMs: 1000, outcome: "succeeded" };
  return { delayMs: 15000, outcome: "succeeded" };
}

// ─────────────────────────── 假数据 ───────────────────────────

export const MODELS: ImageModel[] = [
  { id: "flux-schnell", name: "Flux Schnell", credits: 1, supportsImageToImage: false },
  { id: "flux-pro", name: "Flux Pro", credits: 2, supportsImageToImage: true },
  { id: "nanobanana", name: "Nanobanana", credits: 3, supportsImageToImage: true },
];

export const ASPECT_RATIOS = ["1:1", "16:9", "9:16"] as const;

export const PLANS: Plan[] = [
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

export const ADDON_PACKS: AddonPack[] = [
  { id: "pack-100", credits: 100, priceUsd: 5 },
  { id: "pack-450", credits: 450, priceUsd: 20 },
  { id: "pack-1200", credits: 1200, priceUsd: 50 },
];

export const PLACEHOLDER_IMAGE_URL = "/placeholder-generation.svg";

// ─────────────────────── 内存状态（会随 dev server 重启丢失）───────────────────────

let balance: CreditBalance = { monthly: 12, addon: 3 };

export function getBalance(): CreditBalance {
  return { ...balance };
}

export function setBalance(next: CreditBalance): void {
  balance = { ...next };
}
```

初始余额刻意设成 `monthly: 12, addon: 3`——总共 15 次，用 Flux Pro（2 次）生成 7 次后月度耗尽并开始扣加量包，8 次后余额不足。这样**手工点几下就能走到所有边界**，不用改代码造数据。

- [ ] **Step 5: 运行测试确认通过**

```bash
npm test
```

期望：`Test Files 3 passed`，测试总数从 39 增加到 55（本任务新增 16 个）。

- [ ] **Step 6: 类型检查**

```bash
npx tsc --noEmit
```

期望：无输出。

- [ ] **Step 7: 提交**

```bash
git add lib/generation-types.ts lib/fixtures.ts tests/fixtures.test.ts
git commit -m "feat: 生成相关类型与双余额扣费纯函数"
```

---

## Task 2: 只读假数据接口与占位图

**Files:**
- Create: `public/placeholder-generation.svg`
- Create: `app/api/models/route.ts`
- Create: `app/api/plans/route.ts`
- Create: `app/api/credits/route.ts`

这三个接口只读、无副作用，不需要同源守卫（`checkSameOrigin` 是防 CSRF 的，只有会改变状态的写操作才需要）。

- [ ] **Step 1: 造一个本地占位图**

`public/placeholder-generation.svg`（用本地 SVG 而不是外部图床，是为了离线可用、端到端测试不受网络波动影响）：

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e4e4e7"/>
      <stop offset="100%" stop-color="#a1a1aa"/>
    </linearGradient>
  </defs>
  <rect width="768" height="768" fill="url(#g)"/>
  <text x="384" y="376" text-anchor="middle" font-family="system-ui, sans-serif" font-size="28" fill="#52525b">Mock generation</text>
  <text x="384" y="412" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" fill="#71717a">接入真实上游后替换</text>
</svg>
```

- [ ] **Step 2: 实现三个只读接口**

`app/api/models/route.ts`：

```ts
import { NextResponse } from "next/server";
import { MODELS } from "@/lib/fixtures";

export async function GET() {
  return NextResponse.json({ models: MODELS });
}
```

`app/api/plans/route.ts`：

```ts
import { NextResponse } from "next/server";
import { ADDON_PACKS, PLANS } from "@/lib/fixtures";

export async function GET() {
  return NextResponse.json({ plans: PLANS, addonPacks: ADDON_PACKS });
}
```

`app/api/credits/route.ts`：

```ts
import { NextResponse } from "next/server";
import { getBalance } from "@/lib/fixtures";

export async function GET() {
  return NextResponse.json(getBalance());
}
```

- [ ] **Step 3: 手工验证**

启动 dev server（后台运行，别阻塞）：

```bash
npm run dev > /tmp/if-dev.log 2>&1 &
sleep 12
curl -s localhost:3000/api/models
curl -s localhost:3000/api/credits
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/placeholder-generation.svg
```

期望依次：模型数组含三个模型、`{"monthly":12,"addon":3}`、`200`。

- [ ] **Step 4: 提交**

```bash
git add public/placeholder-generation.svg app/api/models app/api/plans app/api/credits
git commit -m "feat: 模型/套餐/余额只读假数据接口与本地占位图"
```

---

## Task 3: 生成接口（POST，同步返回）

**Files:**
- Create: `app/api/generations/route.ts`

这是唯一会改变状态的接口，**必须过同源守卫**——理由见 `lib/bff.ts` 顶部那段注释：`req.json()` 不看 Content-Type，跨站 `<form enctype="text/plain">` 能构造出合法 JSON，`SameSite=lax` 挡不住。

- [ ] **Step 1: 实现**

`app/api/generations/route.ts`：

```ts
import { NextResponse } from "next/server";
import { checkSameOrigin } from "@/lib/bff";
import {
  MODELS,
  PLACEHOLDER_IMAGE_URL,
  applyRefund,
  applySpend,
  getBalance,
  planSpend,
  resolvePromptBehavior,
  setBalance,
} from "@/lib/fixtures";
import type { Generation } from "@/lib/generation-types";

const ERR_BAD_REQUEST = 40000;
const ERR_INSUFFICIENT_CREDITS = 40001;
const ERR_MODEL_UNAVAILABLE = 40003;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const forbidden = checkSameOrigin(req);
  if (forbidden) {
    return NextResponse.json(forbidden.body, { status: forbidden.status });
  }

  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const modelId = typeof body?.model === "string" ? body.model : "";
  const aspectRatio = typeof body?.aspectRatio === "string" ? body.aspectRatio : "1:1";

  if (!prompt) {
    return NextResponse.json(
      { code: ERR_BAD_REQUEST, message: "prompt is required" },
      { status: 400 },
    );
  }

  const model = MODELS.find((m) => m.id === modelId);
  if (!model) {
    return NextResponse.json(
      { code: ERR_MODEL_UNAVAILABLE, message: "model is not available" },
      { status: 400 },
    );
  }

  // 扣费。真实后端这里是条件原子更新 + 同事务写流水，杜绝并发扣成负数。
  const before = getBalance();
  const split = planSpend(before, model.credits);
  if (!split) {
    return NextResponse.json(
      { code: ERR_INSUFFICIENT_CREDITS, message: "not enough credits" },
      { status: 402 },
    );
  }
  setBalance(applySpend(before, split));

  const behavior = resolvePromptBehavior(prompt);
  await sleep(behavior.delayMs);

  if (behavior.outcome === "failed") {
    // 退款按扣费时记录的拆分还回，而不是笼统还成月度次数。
    setBalance(applyRefund(getBalance(), split));
    const failed: Generation = {
      id: crypto.randomUUID(),
      model: model.id,
      prompt,
      aspectRatio,
      status: "failed",
      error: "upstream model returned an error",
      creditsSpent: 0,
      createdAt: new Date().toISOString(),
    };
    return NextResponse.json(failed, { status: 200 });
  }

  const succeeded: Generation = {
    id: crypto.randomUUID(),
    model: model.id,
    prompt,
    aspectRatio,
    status: "succeeded",
    imageUrl: PLACEHOLDER_IMAGE_URL,
    creditsSpent: model.credits,
    createdAt: new Date().toISOString(),
  };
  return NextResponse.json(succeeded, { status: 200 });
}
```

注意失败时 `creditsSpent` 记 `0`——次数已经退回，记成 2 会让前端显示"消耗 2 次"而实际没扣，用户对不上账。

- [ ] **Step 2: 手工验证四条路径**

dev server 跑着的前提下：

```bash
echo "--- 成功（quick 走 1 秒）---"
curl -s -X POST localhost:3000/api/generations -H 'content-type: application/json' -H 'Sec-Fetch-Site: same-origin' -d '{"prompt":"quick cat","model":"flux-pro","aspectRatio":"1:1"}'
echo; echo "--- 余额应减 2 ---"
curl -s localhost:3000/api/credits
echo; echo "--- 失败并退款 ---"
curl -s -X POST localhost:3000/api/generations -H 'content-type: application/json' -H 'Sec-Fetch-Site: same-origin' -d '{"prompt":"fail please","model":"flux-pro","aspectRatio":"1:1"}'
echo; echo "--- 余额应与上一次相同（已退回）---"
curl -s localhost:3000/api/credits
echo; echo "--- 跨站请求应 403 ---"
curl -s -w " [%{http_code}]\n" -X POST localhost:3000/api/generations -H 'content-type: application/json' -H 'Sec-Fetch-Site: cross-site' -d '{"prompt":"quick","model":"flux-pro"}'
```

期望：第一次返回 `"status":"succeeded"` 且带 `imageUrl`；余额变成 `{"monthly":10,"addon":3}`；失败请求返回 `"status":"failed"` 且 `creditsSpent:0`；余额仍是 `{"monthly":10,"addon":3}`；跨站请求 `[403]`。

- [ ] **Step 3: 提交**

```bash
git add app/api/generations
git commit -m "feat: 同步生成接口（假数据），扣费与失败退款按余额拆分"
```

---

## Task 4: 顶栏余额徽标

**Files:**
- Create: `components/credit-badge.tsx`
- Modify: `components/site-header.tsx`

- [ ] **Step 1: 实现徽标**

`components/credit-badge.tsx`（Server Component，直接读 fixtures，不走 HTTP——同进程内没必要绕一圈）：

```tsx
import Link from "next/link";
import { getBalance } from "@/lib/fixtures";

/**
 * 余额常驻顶栏右上角。调研中 Freepik、Recraft 都放在右上；Adobe Firefly 把余额
 * 藏进头像菜单，因此招致用户投诉——明确不效仿。
 */
export async function CreditBadge() {
  const { monthly, addon } = getBalance();
  const total = monthly + addon;
  return (
    <Link
      href="/pricing"
      data-testid="credit-badge"
      title={`月度 ${monthly} 次 + 加量包 ${addon} 次`}
      className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground hover:bg-muted"
    >
      ◆ {total} 次
    </Link>
  );
}
```

- [ ] **Step 2: 挂进顶栏**

修改 `components/site-header.tsx`，在已登录分支里把 `CreditBadge` 放在 `Account` 链接**之前**（余额在右上、账户在最右）。顶部加 `import { CreditBadge } from "@/components/credit-badge";`，已登录分支改成：

```tsx
          {signedIn ? (
            <>
              <CreditBadge />
              <Link href="/generate" className={buttonVariants({ variant: "ghost" })}>
                Generate
              </Link>
              <Link href="/account" className={buttonVariants({ variant: "ghost" })}>
                Account
              </Link>
            </>
          ) : (
```

未登录分支保持原样不动。注意这里三个都是 `Link + buttonVariants`，不是 `Button render`——违反会被 `e2e/auth.spec.ts` 的 `role=link` 断言打回。

- [ ] **Step 3: 验证**

```bash
npx tsc --noEmit && npm run lint
```

期望：均无输出。然后 dev server 跑着时，用已登录的 cookie 请求首页确认徽标出现：

```bash
curl -s -c /tmp/c.txt -X POST localhost:3000/api/auth/login -H 'content-type: application/json' -H 'Sec-Fetch-Site: same-origin' -d '{"email":"demo@image.test","password":"demo12345"}' > /dev/null
curl -s -b /tmp/c.txt localhost:3000/ | grep -o 'data-testid="credit-badge"'
```

期望：输出 `data-testid="credit-badge"`。若 `demo@image.test` 不存在，先注册一个再登录。

- [ ] **Step 4: 提交**

```bash
git add components/credit-badge.tsx components/site-header.tsx
git commit -m "feat: 顶栏常驻余额徽标"
```

---

## Task 5: 工作台骨架与参数面板

**Files:**
- Create: `app/generate/page.tsx`
- Create: `components/generate/workbench.tsx`
- Create: `components/generate/model-selector.tsx`
- Create: `components/generate/param-panel.tsx`
- Modify: `proxy.ts`

- [ ] **Step 1: 把 /generate 加入受保护路由**

修改 `proxy.ts` 的 matcher（未登录访问工作台应跳登录页）：

```ts
export const config = {
  matcher: ["/account/:path*", "/generate/:path*"],
};
```

其余不动。

- [ ] **Step 2: 页面壳（Server Component）**

`app/generate/page.tsx`：

```tsx
import { MODELS, getBalance } from "@/lib/fixtures";
import { Workbench } from "@/components/generate/workbench";

export const metadata = { title: "Generate · Image Studio" };

export default async function GeneratePage() {
  // 服务端直接读 fixtures，首屏无加载闪烁。接真后端时这里改成 lib/backend.ts 调用
  // （届时会变成真正的 await，所以现在就保留 async 签名，避免那次改动牵连函数签名）。
  const models = MODELS;
  const balance = getBalance();
  return <Workbench models={models} initialBalance={balance} />;
}
```

- [ ] **Step 3: 模型选择器**

`components/generate/model-selector.tsx`（用原生 `select`——shadcn v4 没装 Select 组件，为一个下拉再引一个 Base UI 依赖不划算；原生 select 的可访问性和移动端体验反而更好）：

```tsx
"use client";

import type { ImageModel } from "@/lib/generation-types";

export function ModelSelector({
  models,
  value,
  onChange,
  disabled,
}: {
  models: ImageModel[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="model" className="text-xs text-muted-foreground">
        模型
      </label>
      <select
        id="model"
        data-testid="model-selector"
        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} · {m.credits} 次
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 4: 参数面板**

`components/generate/param-panel.tsx`。Prompt 与生成按钮**锚在面板底部**（`mt-auto`）——这是调研结论：Midjourney、Krea、Recraft、Firefly、Freepik 五家都是底部锚定。生成按钮上**静态标注本次消耗**。

```tsx
"use client";

import { useState } from "react";
import { ModelSelector } from "@/components/generate/model-selector";
import { Button } from "@/components/ui/button";
import { ASPECT_RATIOS } from "@/lib/fixtures";
import type { ImageModel } from "@/lib/generation-types";

export function ParamPanel({
  models,
  modelId,
  onModelChange,
  aspectRatio,
  onAspectRatioChange,
  prompt,
  onPromptChange,
  onSubmit,
  pending,
  isPublic,
  onIsPublicChange,
}: {
  models: ImageModel[];
  modelId: string;
  onModelChange: (id: string) => void;
  aspectRatio: string;
  onAspectRatioChange: (r: string) => void;
  prompt: string;
  onPromptChange: (p: string) => void;
  onSubmit: () => void;
  pending: boolean;
  isPublic: boolean;
  onIsPublicChange: (v: boolean) => void;
}) {
  const [referenceName, setReferenceName] = useState<string | null>(null);
  const model = models.find((m) => m.id === modelId) ?? models[0];

  return (
    <form
      className="flex w-60 shrink-0 flex-col gap-4 border-r bg-muted/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <ModelSelector models={models} value={modelId} onChange={onModelChange} disabled={pending} />

      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">比例</span>
        <div className="flex gap-1.5">
          {ASPECT_RATIOS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={pending}
              aria-pressed={aspectRatio === r}
              onClick={() => onAspectRatioChange(r)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                aspectRatio === r ? "border-foreground font-medium" : "border-input"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reference" className="text-xs text-muted-foreground">
          参考图（可选）
        </label>
        {/* 本轮不做真实上传（R2 未接入），仅取文件名做本地预览，验证布局是否合理。 */}
        <input
          id="reference"
          type="file"
          accept="image/*"
          disabled={pending || !model.supportsImageToImage}
          onChange={(e) => setReferenceName(e.target.files?.[0]?.name ?? null)}
          className="w-full text-xs file:mr-2 file:rounded file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-xs"
        />
        {!model.supportsImageToImage && (
          <p className="text-xs text-muted-foreground">当前模型不支持图生图</p>
        )}
        {referenceName && <p className="truncate text-xs">{referenceName}</p>}
      </div>

      <div className="mt-auto space-y-2 border-t pt-4">
        <label htmlFor="prompt" className="sr-only">
          Prompt
        </label>
        <textarea
          id="prompt"
          data-testid="prompt-input"
          rows={3}
          required
          disabled={pending}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="描述你想要的画面…"
          className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" className="flex-1" disabled={pending || !prompt.trim()}>
            {pending ? "生成中…" : `生成 ◆ ${model.credits}`}
          </Button>
          <button
            type="button"
            disabled={pending}
            aria-pressed={isPublic}
            title={isPublic ? "公开到画廊" : "仅自己可见"}
            onClick={() => onIsPublicChange(!isPublic)}
            className="rounded-md border border-input px-2 py-1.5 text-sm"
          >
            {isPublic ? "🔓" : "🔒"}
          </button>
        </div>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: 布局壳（本步先只渲染参数面板，结果区留到 Task 6）**

`components/generate/workbench.tsx`：

```tsx
"use client";

import { useState } from "react";
import { ParamPanel } from "@/components/generate/param-panel";
import type { CreditBalance, ImageModel } from "@/lib/generation-types";

export function Workbench({
  models,
  initialBalance,
}: {
  models: ImageModel[];
  initialBalance: CreditBalance;
}) {
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [prompt, setPrompt] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [pending, setPending] = useState(false);
  const [balance] = useState<CreditBalance>(initialBalance);

  return (
    <div className="flex min-h-[calc(100vh-57px)]">
      <ParamPanel
        models={models}
        modelId={modelId}
        onModelChange={setModelId}
        aspectRatio={aspectRatio}
        onAspectRatioChange={setAspectRatio}
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={() => setPending(true)}
        pending={pending}
        isPublic={isPublic}
        onIsPublicChange={setIsPublic}
      />
      <div className="flex-1 p-4 text-sm text-muted-foreground">
        结果区（Task 6 实现）· 余额 {balance.monthly + balance.addon}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 验证**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

期望：均通过，build 输出里出现 `/generate` 路由。

- [ ] **Step 7: 提交**

```bash
git add app/generate components/generate proxy.ts
git commit -m "feat: 工作台参数面板与布局壳，/generate 纳入受保护路由"
```

---

## Task 6: 结果区与提交流程

**Files:**
- Create: `components/generate/result-panel.tsx`
- Modify: `components/generate/workbench.tsx`

- [ ] **Step 1: 结果区组件**

`components/generate/result-panel.tsx`。**不用确定性进度条**——上游不提供进度信号，画一条会走的进度条是骗用户。改为骨架动画 + 已用秒数。

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Generation } from "@/lib/generation-types";

function ElapsedSkeleton() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      data-testid="generating-skeleton"
      className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border bg-muted/40"
    >
      <div className="h-24 w-24 animate-pulse rounded-lg bg-muted" />
      {/* 显示真实已耗时，而不是假装知道进度——上游没有进度信号。 */}
      <p className="text-sm text-muted-foreground">已生成 {seconds} 秒…</p>
    </div>
  );
}

export function ResultPanel({
  pending,
  current,
  error,
  recent,
}: {
  pending: boolean;
  current: Generation | null;
  error: string | null;
  recent: Generation[];
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="min-h-[320px] flex-1">
        {pending ? (
          <ElapsedSkeleton />
        ) : error ? (
          <div
            role="alert"
            data-testid="result-error"
            className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 p-6 text-center"
          >
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        ) : current?.status === "succeeded" && current.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={current.imageUrl}
            alt={current.prompt}
            data-testid="result-image"
            className="h-full w-full rounded-lg border object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border bg-muted/40 text-sm text-muted-foreground">
            填写左侧参数，点击生成
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">最近生成（仅本次会话）</p>
          <div className="flex gap-1.5">
            {recent.map((g) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={g.id}
                src={g.imageUrl}
                alt={g.prompt}
                className="size-11 rounded border object-cover"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

用原生 `<img>` 而非 `next/image`：结果图将来是上游返回的任意外域 URL，`next/image` 需要预先配置 `remotePatterns` 白名单，而上游域名此刻未知。ESLint 的告警用行内注释关掉并在此说明理由。

- [ ] **Step 2: 接线提交流程**

把 `components/generate/workbench.tsx` 整体替换为：

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ParamPanel } from "@/components/generate/param-panel";
import { ResultPanel } from "@/components/generate/result-panel";
import { InsufficientCreditsDialog } from "@/components/generate/insufficient-credits-dialog";
import type { CreditBalance, Generation, ImageModel } from "@/lib/generation-types";

const ERR_INSUFFICIENT_CREDITS = 40001;
/** 覆盖最慢模型（约 3 分钟）并留余量。 */
const CLIENT_TIMEOUT_MS = 240_000;

export function Workbench({
  models,
  initialBalance,
}: {
  models: ImageModel[];
  initialBalance: CreditBalance;
}) {
  const router = useRouter();
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [prompt, setPrompt] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [pending, setPending] = useState(false);
  const [current, setCurrent] = useState<Generation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Generation[]>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [balance, setBalance] = useState<CreditBalance>(initialBalance);

  async function refreshBalance() {
    try {
      const res = await fetch("/api/credits");
      if (res.ok) setBalance(await res.json());
    } catch {
      // 余额刷新失败不影响主流程，静默即可——顶栏会在下次导航时同步。
    }
    // 顶栏余额是 Server Component 渲染的，需要 refresh 才会更新。
    router.refresh();
  }

  async function onSubmit() {
    setError(null);
    setCurrent(null);
    setPending(true);
    try {
      const res = await fetch("/api/generations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, model: modelId, aspectRatio, isPublic }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.code === ERR_INSUFFICIENT_CREDITS) {
          setShowUpgrade(true);
        } else {
          setError(body?.message ?? "Something went wrong");
        }
        return;
      }

      const generation: Generation = await res.json();
      if (generation.status === "failed") {
        const model = models.find((m) => m.id === generation.model);
        setError(`生成失败：${generation.error ?? "unknown error"}。已退回 ${model?.credits ?? 0} 次。`);
      } else {
        setCurrent(generation);
        setRecent((r) => [generation, ...r].slice(0, 8));
      }
      await refreshBalance();
    } catch (e) {
      // fetch 只在网络层失败时 reject。不接住就是一条静默的 unhandled rejection：
      // 按钮闪一下恢复原样，用户完全看不出发生了什么（M1 登录表单踩过这个坑）。
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      setError(timedOut ? "生成超时，请重试。次数未被扣除。" : "网络错误，请重试。");
    } finally {
      // 这里与认证表单不同：生成完成后**留在原页**，组件不会被卸载，
      // 所以必须复位 pending，否则按钮永久禁用。
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex min-h-[calc(100vh-57px)]">
        <ParamPanel
          models={models}
          modelId={modelId}
          onModelChange={setModelId}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={onSubmit}
          pending={pending}
          isPublic={isPublic}
          onIsPublicChange={setIsPublic}
        />
        <ResultPanel pending={pending} current={current} error={error} recent={recent} />
      </div>
      <InsufficientCreditsDialog
        open={showUpgrade}
        balance={balance}
        onClose={() => setShowUpgrade(false)}
      />
    </>
  );
}
```

**注意这里对铁律 2 的例外**：认证表单成功后不复位 pending，是因为导航会卸载组件；工作台成功后停留在原页，不复位就永久禁用。差异写进了注释，别照搬。

- [ ] **Step 3: 验证（Task 7 建好弹窗前会有一个未解析的 import，先跳过 build）**

本步先不跑 build——`InsufficientCreditsDialog` 在 Task 7 才创建。Task 7 结束后统一验证。

- [ ] **Step 4: 提交**

```bash
git add components/generate/result-panel.tsx components/generate/workbench.tsx
git commit -m "feat: 结果区与生成提交流程（骨架+已用秒数，不做假进度条）"
```

---

## Task 7: 余额不足弹窗

**Files:**
- Create: `components/generate/insufficient-credits-dialog.tsx`

- [ ] **Step 1: 实现**

用原生 `<dialog>`——shadcn v4 未装 Dialog 组件，原生元素自带焦点陷阱、Esc 关闭和 backdrop，比引一个新依赖划算。

```tsx
"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { CreditBalance } from "@/lib/generation-types";

export function InsufficientCreditsDialog({
  open,
  balance,
  onClose,
}: {
  open: boolean;
  balance: CreditBalance;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-testid="insufficient-credits-dialog"
      onClose={onClose}
      className="rounded-lg border p-0 backdrop:bg-black/40"
    >
      <div className="w-80 space-y-3 p-5">
        <h2 className="text-lg font-semibold">次数不够了</h2>
        <p className="text-sm text-muted-foreground">
          当前剩余月度 {balance.monthly} 次、加量包 {balance.addon} 次，不足以完成这次生成。
        </p>
        <div className="flex gap-2 pt-1">
          {/* 导航用 Link + buttonVariants，不用 Button render——见计划顶部铁律 3。 */}
          <Link href="/pricing" className={buttonVariants({ size: "sm" })}>
            查看套餐
          </Link>
          <button
            type="button"
            onClick={onClose}
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            稍后再说
          </button>
        </div>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 2: 全量验证**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

期望：tsc 无输出、lint 无输出、55 个单测通过、build 成功且路由清单含 `/generate`。

- [ ] **Step 3: 手工走一遍真实交互**

dev server 跑着，浏览器登录后打开 `http://localhost:3000/generate`：

1. 输入 `quick cat` 点生成 → 约 1 秒后出现占位图，顶栏余额减 2
2. 输入 `fail this` 点生成 → 约 8 秒后显示"生成失败…已退回 2 次"，余额回到原值
3. 反复用 `quick` 生成直到余额不足 → 弹出"次数不够了"，点"查看套餐"跳 `/pricing`（该页 Task 8 才有，此时 404 属正常）

- [ ] **Step 4: 提交**

```bash
git add components/generate/insufficient-credits-dialog.tsx
git commit -m "feat: 余额不足弹窗，引导至定价页"
```

---

## Task 8: 定价页

**Files:**
- Create: `app/pricing/page.tsx`
- Create: `components/pricing/plan-cards.tsx`
- Create: `components/pricing/addon-packs.tsx`

- [ ] **Step 1: 套餐卡**

`components/pricing/plan-cards.tsx`。**每张卡必须标注"约 $0.0XX 每次"**——这是让价格梯度可见的唯一办法，不标则用户需自行计算，多数人不会算，"越贵越划算"的机制随之失效。

```tsx
import type { Plan } from "@/lib/generation-types";

function perCredit(plan: Plan): string {
  return `$${(plan.priceUsd / plan.monthlyCredits).toFixed(3)}`;
}

export function PlanCards({ plans }: { plans: Plan[] }) {
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
```

按钮 `disabled` 并带 `title="Stripe 尚未接入"`——本轮不接支付，做成可点却什么都不发生比明确禁用更糟。

- [ ] **Step 2: 加量包与双余额说明**

`components/pricing/addon-packs.tsx`：

```tsx
import type { AddonPack } from "@/lib/generation-types";

export function AddonPacks({ packs }: { packs: AddonPack[] }) {
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
            生成时<strong>优先扣月度次数</strong>，月度用尽才动加量包——所以加量包不会被"月底清零"白白浪费。
          </p>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 3: 页面**

`app/pricing/page.tsx`：

```tsx
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
```

`/pricing` 不进 `proxy.ts` 的 matcher——未登录用户必须能看定价页。

- [ ] **Step 4: 验证**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

期望：均通过，路由清单含 `/pricing`。再确认页面渲染：

```bash
curl -s localhost:3000/pricing | grep -o 'Simple, usage-based pricing'
curl -s localhost:3000/pricing | grep -c '每次'
```

期望：第一条输出标题；第二条计数 ≥ 6（三张卡 + 三个加量包各一处）。

- [ ] **Step 5: 提交**

```bash
git add app/pricing components/pricing
git commit -m "feat: 定价页（三档套餐 + 加量包 + 双余额说明）"
```

---

## Task 9: 端到端测试

**Files:**
- Create: `e2e/generate.spec.ts`

**为什么用 `quick` 关键词：** 普通 prompt 要等 15 秒，三条用例串起来测试套件就要跑一分钟。`quick` 走 1 秒路径，让断言聚焦在流程正确性上；等待体验单独用一条断言覆盖（只验证骨架和秒数出现，不等它完成）。

- [ ] **Step 1: 写测试**

`e2e/generate.spec.ts`：

```ts
import { test, expect } from "@playwright/test";

const PASSWORD = "secret12345";

function uniqueEmail() {
  return `gen-${process.pid}-${Date.now()}@example.com`;
}

/** 注册并登录一个全新账号，返回后停在 /account。 */
async function signUp(page: import("@playwright/test").Page) {
  const email = uniqueEmail();
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return email;
}

test("未登录访问 /generate 被重定向到 /login", async ({ page }) => {
  await page.goto("/generate");
  await expect(page).toHaveURL(/\/login$/);
});

test("生成成功：出图并扣次数", async ({ page }) => {
  await signUp(page);

  const before = Number(
    (await page.getByTestId("credit-badge").textContent())!.replace(/\D/g, ""),
  );

  await page.goto("/generate");
  await page.getByTestId("prompt-input").fill("quick cat astronaut");
  await page.getByRole("button", { name: /生成/ }).click();

  await expect(page.getByTestId("result-image")).toBeVisible({ timeout: 15_000 });

  // Flux Schnell 是列表首项、消耗 1 次
  const after = Number(
    (await page.getByTestId("credit-badge").textContent())!.replace(/\D/g, ""),
  );
  expect(after).toBe(before - 1);
});

test("生成失败：显示原因并退回次数", async ({ page }) => {
  await signUp(page);
  await page.goto("/generate");

  const before = Number(
    (await page.getByTestId("credit-badge").textContent())!.replace(/\D/g, ""),
  );

  await page.getByTestId("prompt-input").fill("please fail this one");
  await page.getByRole("button", { name: /生成/ }).click();

  await expect(page.getByTestId("result-error")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("result-error")).toContainText("已退回");

  const after = Number(
    (await page.getByTestId("credit-badge").textContent())!.replace(/\D/g, ""),
  );
  expect(after).toBe(before);
});

test("生成过程中显示骨架与已用秒数，而不是假进度条", async ({ page }) => {
  await signUp(page);
  await page.goto("/generate");
  // 用默认 15 秒路径，但只断言等待态出现，不等它完成
  await page.getByTestId("prompt-input").fill("a detailed landscape");
  await page.getByRole("button", { name: /生成/ }).click();

  await expect(page.getByTestId("generating-skeleton")).toBeVisible();
  await expect(page.getByTestId("generating-skeleton")).toContainText("已生成");
  await expect(page.locator("progress")).toHaveCount(0);
});

test("定价页对未登录用户可见，套餐与加量包齐全", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByTestId("plan-starter")).toBeVisible();
  await expect(page.getByTestId("plan-pro")).toBeVisible();
  await expect(page.getByTestId("plan-max")).toBeVisible();
  await expect(page.getByTestId("addon-pack-100")).toBeVisible();
  await expect(page.getByText("优先扣月度次数")).toBeVisible();
});
```

**注意余额徽标是全局共享的内存状态**——所有测试账号共用同一个 `balance`。因此断言必须写成"相对变化"（`after === before - 1`），不能写死绝对值。这一点在接入真实后端、余额变成 per-user 之后会自然消失。

- [ ] **Step 2: 运行**

确认 Go 后端在 `localhost:8080` 运行（`curl -s localhost:8080/api/v1/health` 应返回 `{"status":"ok"}`），然后：

```bash
npx playwright test
```

期望：`9 passed`（原有 4 条 + 新增 5 条）。

若"生成成功"用例的扣次数断言失败，先确认默认选中的模型是不是 Flux Schnell（列表首项，1 次）——`MODELS` 顺序改动会影响这条断言。

- [ ] **Step 3: 提交**

```bash
git add e2e/generate.spec.ts
git commit -m "test: 工作台与定价页端到端覆盖"
```

---

## Task 10: README 更新与最终验证

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README 的页面表与开发命令**

把 `README.md` 中「## 页面（M1）」一节整体替换为：

```markdown
## 页面

| 路由 | 说明 | 状态 |
|---|---|---|
| `/` | 落地页 | 真实 |
| `/register` | 邮箱注册 | 真实 |
| `/login` | 邮箱登录 | 真实 |
| `/account` | 当前用户信息 + 登出 | 真实 |
| `/generate` | 生成工作台 | **假数据** |
| `/pricing` | 定价与加量包 | **假数据**，按钮未接 Stripe |

### 假数据说明

`/generate` 与 `/pricing` 的数据来自 `app/api/{models,plans,credits,generations}` 返回的写死内容，
状态存在 `lib/fixtures.ts` 的模块级变量里，**dev server 重启即重置**。

生成结果由 prompt 关键词**确定性**触发，便于复现与自动化测试：

| prompt 含 | 行为 |
|---|---|
| `fail` | 8 秒后失败，退回次数 |
| `slow` | 90 秒后成功 |
| `quick` | 1 秒后成功（端到端测试用） |
| 其他 | 15 秒后成功 |

接入真实后端时只改这四个 Route Handler 内部并删除 `lib/fixtures.ts`，
组件、类型与测试均不动。设计依据见
`docs/superpowers/specs/2026-07-27-m2-frontend-workbench-pricing-design.md`。
```

同时把「## 开发命令」一节里的注释更新为 `npm test # Vitest 单元测试（55 个）` 与 `npm run test:e2e # Playwright 端到端（9 条，需后端在跑）`。

- [ ] **Step 2: 在「M1 未覆盖 / 已知缺口」一节追加**

```markdown
- 生成接口是**同步**的（上游对图像同步返回 URL，最慢约 3 分钟）。这依赖两个前提：
  域名**不经过 Cloudflare 橙云代理**（其 100 秒 524 限制不可配置），且不部署到
  Vercel Hobby（Route Handler 60 秒上限）。任一前提变化，必须改为 SSE 流式心跳。
- 接后端时须注意：上游调用要用脱离请求的 context，否则用户关闭页面会导致扣了
  次数丢了图；并且要先落 `generations` 行、启动时扫 `processing` 兜底退款。
- `/history` 因同步模式重要性上升——它是"关闭页面后找回图片"的唯一途径，应紧随本轮实现。
```

- [ ] **Step 3: 全量验证**

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build && npx playwright test
```

期望：lint 无输出、tsc 无输出、55 个单测通过、build 成功、9 条 e2e 通过。

- [ ] **Step 4: 确认没有敏感文件被跟踪**

```bash
git ls-files | grep -Ei '\.env$|\.pem$|\.key$|test-results|playwright-report|\.superpowers' || echo "(clean)"
```

期望：输出 `(clean)`。

- [ ] **Step 5: 提交**

```bash
git add README.md
git commit -m "docs: README 补充工作台与定价页、假数据机制与同步生成前提"
```

---

## 不在本计划范围内

- `/history`、`/gallery`、管理后台
- Stripe 订阅、加量包支付、webhook
- 真实上游生成调用、R2 图片转存、参考图上传
- OAuth 登录、邮箱验证、忘记密码
- 登录接口速率限制（前后端皆无，上线前必补）

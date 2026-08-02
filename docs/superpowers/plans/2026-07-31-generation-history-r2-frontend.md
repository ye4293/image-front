# 生成历史页 · 前端实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户能在 `/history` 翻回自己所有的历史生成，包含失败记录，并对未转存的临时链接给出诚实提示。

**Architecture:** 沿用既有 BFF 架构——首屏由 RSC 直连 Go（不绕自家 Route Handler），「加载更多」由客户端组件打同源的 `app/api/generations` GET。类型与错误码只在 `lib/generation-types.ts` 与 `lib/backend.ts` 各声明一次。

**Tech Stack:** Next 16（Proxy 而非 Middleware）/ React 19 / next-intl / Tailwind v4 / shadcn v4（基于 `@base-ui/react`，**无 `asChild`**）。

**前置：** 后端计划 `../image-backend/docs/superpowers/plans/2026-07-31-generation-history-r2-backend.md` 全部 6 个任务完成且 `go test ./...` 全绿。契约以那份计划的 Task 6 为准：

```
GET /api/v1/generations?cursor=<opaque>&limit=<1..50，默认 20>
→ 200 {"generations":[<与 POST /generations 同形状，成功项多一个 stored:boolean>],
       "nextCursor": string | null}
→ 400 {"code":40000,"message":"invalid cursor"}
→ 401 / 403 沿用中间件
```

**读这个仓库的代码前先读 `AGENTS.md`：** Next 16 的 API 与训练数据里的不一样，`node_modules/next/dist/docs/` 是唯一可信来源。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `lib/generation-types.ts`（改） | `Generation` 成功项加 `stored`；新增 `GenerationPage` |
| `lib/backend.ts`（改） | 新增 `listGenerations` |
| `tests/backend.test.ts`（改） | `listGenerations` 的映射与 query 拼装 |
| `app/api/generations/route.ts`（改） | 加 `GET`（同路径不同方法） |
| `app/[locale]/history/page.tsx`（新） | RSC 首屏 |
| `components/history-grid.tsx`（新） | 客户端组件：网格 + 「加载更多」 |
| `components/history-card.tsx`（新） | 单卡片三态渲染 |
| `messages/{en,zh,ja,ko}.json`（改） | `History` 命名空间，四语 |
| `proxy.ts`（改） | `PROTECTED` 加 `history` |
| `components/site-header.tsx`（改） | 顶栏入口 |
| `e2e/accounts.ts`（新） | 从 `generate.spec.ts` 抽出的账号夹具（注册+发次数+登录） |
| `e2e/history.spec.ts`（新） | 含 375×667 |

**为什么卡片单独拆一个文件：** 三态（永久图 / 临时链接 / 失败）各带自己的文案与样式分支，塞进网格组件会让「分页状态机」和「单条渲染」两件事互相干扰。

---

## Task 1：类型与 `listGenerations`

**Files:**
- Modify: `lib/generation-types.ts`, `lib/backend.ts`
- Test: `tests/backend.test.ts`

- [ ] **Step 1：先写失败的测试**

追加到 `tests/backend.test.ts` 末尾（并把 `listGenerations` 加进顶部 import）：

```ts
describe("listGenerations", () => {
  it("成功时返回列表与 nextCursor，并带上 Bearer", async () => {
    const page = {
      generations: [
        {
          id: "g1", model: "flux-2-max", prompt: "cat", aspectRatio: "1:1",
          isPublic: false, creditsSpent: 7, createdAt: "2026-07-31T10:00:00Z",
          status: "succeeded", imageUrl: "https://img.example.com/g/g1.png", stored: true,
        },
      ],
      nextCursor: "Y3Vyc29y",
    };
    const fn = mockFetch(200, page);
    const res = await listGenerations("tok");
    expect(res).toEqual({ ok: true, data: page });
    expect(fn).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/generations",
      expect.objectContaining({
        headers: { authorization: "Bearer tok" },
        cache: "no-store",
      }),
    );
  });

  it("把 cursor 与 limit 拼进 query", async () => {
    const fn = mockFetch(200, { generations: [], nextCursor: null });
    await listGenerations("tok", { cursor: "abc", limit: 2 });
    expect(fn).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/generations?cursor=abc&limit=2",
      expect.anything(),
    );
  });

  it("不传分页参数时不拼出一个空的问号", async () => {
    // "…/generations?" 这种 URL 大多数后端能容忍，但它会让上面那条断言与真实
    // 请求对不上，也让日志难读。
    const fn = mockFetch(200, { generations: [], nextCursor: null });
    await listGenerations("tok", {});
    expect(fn.mock.calls[0][0]).toBe("http://localhost:8080/api/v1/generations");
  });

  it("nextCursor 为 null 时原样保留，不改写成空串", async () => {
    // null 与 "" 必须区分：消费方靠 null 判断"没有更多"。改写成空串会让
    // 「加载更多」按钮永远显示。
    mockFetch(200, { generations: [], nextCursor: null });
    const res = await listGenerations("tok");
    expect(res.ok && res.data.nextCursor).toBe(null);
  });

  it("非法 cursor 时透出后端的 40000", async () => {
    mockFetch(400, { code: 40000, message: "invalid cursor" });
    const res = await listGenerations("tok", { cursor: "bad" });
    expect(res).toEqual({
      ok: false,
      status: 400,
      error: { code: 40000, message: "invalid cursor" },
    });
  });

  it("token 失效时透出 401", async () => {
    mockFetch(401, { code: 40100, message: "invalid token" });
    const res = await listGenerations("expired");
    expect(res.ok).toBe(false);
    expect(!res.ok && res.status).toBe(401);
  });

  it("后端不可达时合成 ERR_UNREACHABLE", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const res = await listGenerations("tok");
    expect(!res.ok && res.error.code).toBe(ERR_UNREACHABLE);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Run: `npm test -- tests/backend.test.ts`
Expected: FAIL —— `listGenerations` 不是导出的函数（TS 编译错误）。

- [ ] **Step 3：改类型**

`lib/generation-types.ts`。把 `Generation` 联合改成：

```ts
export type Generation =
  | (GenerationBase & {
      status: "succeeded";
      imageUrl: string;
      /**
       * `imageUrl` 是否指向我们自己的存储（后端 `generations.stored`）。
       *
       * `false` 表示它还是上游的临时链接，约一小时后失效——后端 R2 未配置，或
       * 转存失败后降级（那是刻意的：图已经出了、钱已经花了，因为存储抖动就判失败
       * 退款等于把一次已付费的上游调用白扔）。
       *
       * **必须显式渲染这个区别。** 不提示的话页面当下看起来完全正常，一小时后
       * 变成一片坏图，而用户无从判断是自己网络的问题还是我们弄丢了他的图。
       */
      stored: boolean;
    })
  | (GenerationBase & { status: "failed"; error: string });

/**
 * `GET /generations` 的一页。
 *
 * `nextCursor` 在没有下一页时是 `null`（后端刻意序列化成 null 而不是空串）。
 * 声明成 `string | null` 而不是 `string?`，是为了让"后端漏发这个字段"和"没有
 * 下一页"不会变成同一种情况——前者是故障，后者是正常终止条件。
 */
export type GenerationPage = {
  generations: Generation[];
  nextCursor: string | null;
};
```

- [ ] **Step 4：实现 `listGenerations`**

`lib/backend.ts`。在 import 的类型列表里加 `GenerationPage`，并在 `createGeneration` 之后追加：

```ts
/**
 * 当前用户的生成历史，游标分页倒序。
 *
 * 这是"用户付了钱能拿回自己的图"的唯一读路径——在它存在之前，客户端一旦丢掉
 * `createGeneration` 的响应（关标签页、断网、刷新），图片就永久不可达，而次数
 * 已经扣了。
 *
 * `cache: "no-store"`：刚生成完就跳历史页必须能看到那一张。被 Next 的数据缓存
 * 留住的旧列表会让用户以为图没存下来。
 *
 * 已知失败：40000（cursor 不合法，正常使用不会遇到，遇到就是我们自己的 bug）、
 * 401（token 过期，调用方应当送去登录）。
 */
export function listGenerations(
  token: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<Result<GenerationPage>> {
  const params = new URLSearchParams();
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return request<GenerationPage>(`/generations${qs ? `?${qs}` : ""}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}
```

- [ ] **Step 5：跑测试确认通过**

Run: `npm test`
Expected: 新增 7 个测试 PASS，既有 48 个不变。

- [ ] **Step 6：提交**

```bash
git add lib/generation-types.ts lib/backend.ts tests/backend.test.ts
git commit -m "feat: listGenerations 与 Generation.stored 类型"
```

---

## Task 2：BFF 的 `GET /api/generations`

**Files:**
- Modify: `app/api/generations/route.ts`

- [ ] **Step 1：读现有文件**

先读 `app/api/generations/route.ts` 全文，确认 `POST` 的写法、`maxDuration` 的位置与 `toClientError` 的用法。**新增的 `GET` 要沿用同一套错误映射**，不要另写一份。

- [ ] **Step 2：实现 GET**

在同文件追加（与 `POST` 并列导出）：

```ts
/**
 * 历史列表。**只读，故不过 `checkSameOrigin`**——同源守卫防的是 CSRF，只有写操作
 * 需要（与 `app/api/credits/route.ts` 的判断一致）。
 *
 * 存在的理由是「加载更多」按钮：首屏由 `/history` 这个 RSC 直连 Go，但翻页发生在
 * 浏览器里，而浏览器拿不到 httpOnly 的 token，必须经这里代传。
 *
 * `/api/*` 不在 proxy 的 matcher 内，所以鉴权要自己做。
 */
export async function GET(req: Request) {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ code: ERR_FORBIDDEN, message: "not signed in" }, { status: 401 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const rawLimit = url.searchParams.get("limit");
  // 只在能解析成数字时才往下传。传一个 NaN 会变成字符串 "NaN" 进 query，
  // 后端解析失败后回退到默认值——行为正确但难排查，不如这里就丢掉。
  const limit = rawLimit !== null && Number.isFinite(Number(rawLimit))
    ? Number(rawLimit)
    : undefined;

  const res = await listGenerations(token, { cursor, limit });
  if (!res.ok) {
    const out = toClientError(res.error, res.status, "history");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data);
}
```

把 `listGenerations` 加进该文件的 `@/lib/backend` import；确认 `NextResponse`、`getToken`、`toClientError`、`ERR_FORBIDDEN` 都已在 import 中（`POST` 应该已经用了大部分）。

- [ ] **Step 3：检查 `toClientError` 的 surface 参数**

读 `lib/bff.ts` 的 `toClientError`，确认第三个参数（这里传的 `"history"`）只用于服务端日志、不影响返回体。若它参与文案映射，则改传一个已有的 surface 值，或按该函数的约定新增——**不要**让一个未登记的 surface 静默落到 default 分支。

- [ ] **Step 4：跑既有测试确认没打破**

Run: `npm test && npx tsc --noEmit`
Expected: 全绿。（本任务没有新增单测：它是一层薄代传，真实价值由 Task 4 的 e2e「加载更多」覆盖。`lib/bff.ts` 的错误映射已有 24 个单测。）

- [ ] **Step 5：提交**

```bash
git add app/api/generations/route.ts
git commit -m "feat: BFF 加 GET /api/generations 供历史页翻页"
```

---

## Task 3：`/history` 页面、卡片与四语文案

**Files:**
- Create: `app/[locale]/history/page.tsx`, `components/history-grid.tsx`, `components/history-card.tsx`
- Modify: `messages/{en,zh,ja,ko}.json`, `proxy.ts`, `components/site-header.tsx`

- [ ] **Step 1：加四语文案**

四个文件都加同一个命名空间。`messages/en.json`：

```json
  "History": {
    "title": "History",
    "subtitle": "Every image you've generated. Links are permanent unless flagged.",
    "empty": "You haven't generated anything yet.",
    "emptyCta": "Generate your first image",
    "loadMore": "Load more",
    "loading": "Loading…",
    "loadError": "Couldn't load more. Try again.",
    "failedLabel": "Failed",
    "notCharged": "No credits were charged.",
    "temporaryLink": "This link may have expired.",
    "openImage": "Open full size",
    "creditsSpent": "{count, plural, =1 {1 credit} other {# credits}}"
  }
```

`messages/zh.json`：

```json
  "History": {
    "title": "历史记录",
    "subtitle": "你生成过的每一张图。除标注外，链接都是永久有效的。",
    "empty": "你还没有生成过任何图片。",
    "emptyCta": "生成第一张图",
    "loadMore": "加载更多",
    "loading": "加载中…",
    "loadError": "加载失败，请重试。",
    "failedLabel": "生成失败",
    "notCharged": "未扣除次数。",
    "temporaryLink": "该链接可能已失效。",
    "openImage": "查看原图",
    "creditsSpent": "{count, plural, other {# 次}}"
  }
```

`messages/ja.json`：

```json
  "History": {
    "title": "履歴",
    "subtitle": "これまでに生成した画像の一覧です。注記がない限りリンクは永続的です。",
    "empty": "まだ画像を生成していません。",
    "emptyCta": "最初の画像を生成する",
    "loadMore": "さらに読み込む",
    "loading": "読み込み中…",
    "loadError": "読み込めませんでした。もう一度お試しください。",
    "failedLabel": "生成失敗",
    "notCharged": "クレジットは消費されていません。",
    "temporaryLink": "このリンクは期限切れの可能性があります。",
    "openImage": "原寸で開く",
    "creditsSpent": "{count, plural, other {# クレジット}}"
  }
```

`messages/ko.json`：

```json
  "History": {
    "title": "생성 기록",
    "subtitle": "지금까지 생성한 모든 이미지입니다. 표시가 없으면 링크는 영구적입니다.",
    "empty": "아직 생성한 이미지가 없습니다.",
    "emptyCta": "첫 이미지 생성하기",
    "loadMore": "더 보기",
    "loading": "불러오는 중…",
    "loadError": "더 불러올 수 없습니다. 다시 시도해 주세요.",
    "failedLabel": "생성 실패",
    "notCharged": "크레딧이 차감되지 않았습니다.",
    "temporaryLink": "이 링크는 만료되었을 수 있습니다.",
    "openImage": "원본 크기로 열기",
    "creditsSpent": "{count, plural, other {# 크레딧}}"
  }
```

同时给 `Metadata` 加 `historyTitle`：en `"History · Image Studio"`、zh `"历史记录 · Image Studio"`、ja `"履歴 · Image Studio"`、ko `"생성 기록 · Image Studio"`。给 `Nav` 加 `history`：en `"History"`、zh `"历史"`、ja `"履歴"`、ko `"기록"`。

**中日韩没有复数形态**，所以 `creditsSpent` 只给 `other` 分支；英文给 `=1` 与 `other`。这不是偷懒——给中文写 `=1 {1 次}` 会让翻译者以为存在单复数区别而去维护一个永远不会被选中的分支。

- [ ] **Step 2：确认四个文件的 key 集合完全一致**

Run:
```bash
node -e "const l=['en','zh','ja','ko'].map(x=>[x,require('./messages/'+x+'.json')]);const f=o=>{const r=[];const w=(p,v)=>{for(const k in v){const q=p?p+'.'+k:k;typeof v[k]==='object'?w(q,v[k]):r.push(q)}};w('',o);return r.sort()};const b=f(l[0][1]);for(const [n,o] of l){const k=f(o);if(JSON.stringify(k)!==JSON.stringify(b)){console.log(n,'不一致');console.log('缺:',b.filter(x=>!k.includes(x)));console.log('多:',k.filter(x=>!b.includes(x)))}}console.log('共',b.length,'个 key')"
```
Expected: 无「不一致」输出，且四个文件 key 数相同。

- [ ] **Step 3：写卡片组件**

Create `components/history-card.tsx`：

```tsx
import { useTranslations } from "next-intl";

import type { Generation } from "@/lib/generation-types";

/**
 * 单条历史记录，三态：
 *
 * 1. 成功且 `stored` —— 正常图，链接永久；
 * 2. 成功但 `!stored` —— 图 + 「链接可能已失效」。**必须显式提示**：不提示的话
 *    页面当下完全正常，一小时后变成坏图，用户无从判断是自己的网络还是我们弄丢
 *    了他的图；
 * 3. `failed` —— 灰格子 + 错误 + 「未扣除次数」。失败记录**要**展示：用户看到
 *    "我明明生成过一张"却找不到，会怀疑被吞了钱，而这条记录恰恰证明没扣钱。
 *
 * 用 <img> 而不是 next/image：图片来自运行期才知道的外部域（R2 自定义域，或降级
 * 时的上游 CDN），next/image 需要在 next.config.ts 里预先登记域名，而降级时的
 * 上游域名是不可枚举的。给 next/image 配 unoptimized 等于绕过它全部收益，只留
 * 配置负担。
 */
export function HistoryCard({ generation }: { generation: Generation }) {
  const t = useTranslations("History");

  if (generation.status === "failed") {
    return (
      <li className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex aspect-square items-center justify-center rounded-md bg-neutral-100 text-sm text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {t("failedLabel")}
        </div>
        <p className="line-clamp-2 text-sm text-neutral-700 dark:text-neutral-300">
          {generation.prompt}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("notCharged")}</p>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <a
        href={generation.imageUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={t("openImage")}
        className="block overflow-hidden rounded-md"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={generation.imageUrl}
          alt={generation.prompt}
          loading="lazy"
          className="aspect-square w-full object-cover"
        />
      </a>
      <p className="line-clamp-2 text-sm text-neutral-700 dark:text-neutral-300">
        {generation.prompt}
      </p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {t("creditsSpent", { count: generation.creditsSpent })}
      </p>
      {!generation.stored && (
        <p
          data-testid="temporary-link-warning"
          className="text-xs text-amber-700 dark:text-amber-500"
        >
          {t("temporaryLink")}
        </p>
      )}
    </li>
  );
}
```

- [ ] **Step 4：写网格与「加载更多」**

Create `components/history-grid.tsx`：

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { HistoryCard } from "@/components/history-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Generation, GenerationPage } from "@/lib/generation-types";

/**
 * 历史网格 + 分页。
 *
 * 用**「加载更多」按钮而不是无限滚动**：无限滚动在 375 宽下会让页脚永远够不着，
 * 而且 Playwright 里难以确定性断言"翻到了第二页"（要靠滚动触发 observer，时序
 * 不稳）。
 *
 * 首屏数据由 RSC 传进来，本组件只负责后续页——所以未登录用户根本走不到这里。
 */
export function HistoryGrid({ initial }: { initial: GenerationPage }) {
  const t = useTranslations("History");
  const [items, setItems] = useState<Generation[]>(initial.generations);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/generations?cursor=${encodeURIComponent(cursor)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const page: GenerationPage = await res.json();
      // 用函数式更新：连点两次「加载更多」时，闭包里的 items 会是旧值，
      // 直接 setItems([...items, ...]) 会丢掉其中一页。
      setItems((prev) => [...prev, ...page.generations]);
      setCursor(page.nextCursor);
    } catch {
      // 不显示后端原文：那些 message 是英文的运维文案，四种语言的界面都会露出
      // 英文。走本地化的通用文案。
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-neutral-600 dark:text-neutral-400">{t("empty")}</p>
        {/* shadcn v4 基于 @base-ui/react，没有 asChild；<Button render={<Link/>}> 会给
            锚点强加 role="button"。所以用 Link + buttonVariants。 */}
        <Link href="/generate" className={buttonVariants()}>
          {t("emptyCta")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 375 宽下两列：单列会让翻一页要滚很久，三列的缩略图小到看不出画面。 */}
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((g) => (
          <HistoryCard key={g.id} generation={g} />
        ))}
      </ul>

      {failed && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {t("loadError")}
        </p>
      )}

      {cursor && (
        <div className="flex justify-center">
          <Button onClick={loadMore} disabled={loading}>
            {loading ? t("loading") : t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
```

**实施注意：** `components/ui/button.tsx` 的第 58 行导出的是 `export { Button, buttonVariants }`，上面的 import 已经按实际导出名写好。`/pricing` 的 `plan-cards.tsx` 里已经用过 `Link + buttonVariants` 这个手法，样式细节照它对齐。

- [ ] **Step 5：写页面**

Create `app/[locale]/history/page.tsx`。**先读 `app/[locale]/account/page.tsx`**，照它的形状写——`params` 是 Promise、`getToken()`、401 兜底、`setRequestLocale` 之类的细节必须一致，不要凭记忆写：

```tsx
import { getTranslations } from "next-intl/server";

import { HistoryGrid } from "@/components/history-grid";
import { listGenerations } from "@/lib/backend";
import { getToken } from "@/lib/session";

export async function generateMetadata() {
  const t = await getTranslations("Metadata");
  return { title: t("historyTitle") };
}

/**
 * 历史页。首屏由 RSC 直连 Go（不绕自家 Route Handler——那是多一跳且拿不到任何
 * 好处，见 `pricing/page.tsx` 的同款注释）。
 *
 * proxy 已经拦了未登录（PROTECTED 正则含 history），但这里仍然要判 401：proxy
 * 只检查 cookie **存在**，一个过期或伪造的 token 能过它。
 */
export default async function HistoryPage() {
  const t = await getTranslations("History");
  const token = await getToken();
  if (!token) {
    return <p>{t("empty")}</p>;
  }

  const res = await listGenerations(token);
  if (!res.ok) {
    // 401 交给 proxy 下一次导航去处理；这一屏给一个不会误导的空态即可。
    return <p>{t("empty")}</p>;
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{t("subtitle")}</p>
      </header>
      <HistoryGrid initial={res.data} />
    </main>
  );
}
```

- [ ] **Step 6：加守卫与入口**

`proxy.ts`：

```ts
/** 需要登录的路由（已剥掉语言前缀后的路径）。 */
const PROTECTED = /^\/(?:account|generate|history)(?:\/|$)/;
```

`components/site-header.tsx`：在已登录分支里、`account` 链接旁加一个指向 `/history` 的链接，文案用 `t("history")`（`Nav` 命名空间）。照该文件里 `generate`/`account` 链接的现有写法加，不要引入新的样式模式。

- [ ] **Step 7：类型检查与构建**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 全绿。

Run: `npm run build`
Expected: 构建成功，输出里出现 `/[locale]/history` 路由。

- [ ] **Step 8：提交**

```bash
git add app/[locale]/history components/history-grid.tsx components/history-card.tsx messages proxy.ts components/site-header.tsx
git commit -m "feat: /history 历史页——三态卡片、加载更多、四语文案"
```

---

## Task 4：端到端覆盖（含 375×667）

**Files:**
- Create: `e2e/accounts.ts`, `e2e/history.spec.ts`
- Modify: `e2e/generate.spec.ts`

- [ ] **Step 1：把账号夹具抽成共享模块**

`signUp` 目前是 `e2e/generate.spec.ts` 的**局部**函数（第 43 行），没有导出。历史页用例需要同一套"注册 + 发次数 + 登录"，复制一份会让两处对登录流程的假设各自漂移。

Create `e2e/accounts.ts`——把 `generate.spec.ts` 第 19 行的 `PASSWORD`、第 30 行的 `GRANTED_CREDITS`、第 33 行的 `uniqueEmail`、第 43 行的 `signUp` **原样搬过来**（注释一起搬，别重写）：

```ts
import { expect, type Page } from "@playwright/test";

import { grantCredits } from "./backend";

export const PASSWORD = "secret12345";

/**
 * 每个测试账号领多少次数。新注册的账号余额是 **0**（后端不送新人次数），不发就直接
 * 402，所以这一步是必需的前置数据，不是便利。
 */
export const GRANTED_CREDITS = 10;

/** 每次运行用不同邮箱，避免撞后端唯一索引。加 random 是因为同毫秒内可能建两个账号。 */
export function uniqueEmail(prefix = "gen") {
  return `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/**
 * 注册并登录一个全新账号，**并给它发次数**。返回后停在 /account。
 *
 * 发次数走后端管理员接口（`e2e/backend.ts`），不经浏览器：那是测试数据准备，前端
 * 没有也不该有管理界面。per-user 发放让每条用例互不干扰。
 */
export async function signUp(page: Page, prefix?: string) {
  const email = uniqueEmail(prefix);
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/login/);
  // 发次数必须在注册之后（用户要先存在）、登录进工作台之前（首屏就要读到余额）。
  await grantCredits(email, GRANTED_CREDITS);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  // 限定在 form 内：顶栏也有一个 "Sign in"（是 role=link，但限定住更抗改动）。
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return email;
}
```

改 `e2e/generate.spec.ts`：删掉搬走的那四项，改成 `import { signUp, PASSWORD, GRANTED_CREDITS } from "./accounts";`（只 import 该文件仍在用的）。`uniqueEmail` 若在 `generate.spec.ts` 里没有其他调用点就不必 import。

- [ ] **Step 2：跑既有 e2e 确认抽取没打破任何东西**

Run: `npm run test:e2e -- e2e/generate.spec.ts e2e/auth.spec.ts`
Expected: 既有用例的通过/失败情况与抽取之前**完全一致**。

**实施补记——既有 e2e 在动手之前就是红的，共 2 条失败：**

```
unexpected value "Generate ◆ 7"   (expected "Generate ◆ 1")
  › 生成成功：出图、扣次数，且生成按钮仍在首屏
  › 移动端（375×667） › 生成成功：出图、扣次数
```

`e2e/generate.spec.ts` 里 `DEFAULT_MODEL_COST = 1`，而后端 `seedModels` 播的 `flux-2-max` 是 **7** credits。那条断言的注释写着"变了会连带下面两条余额断言一起失败——这是好事"——它确实在尽职，只是改价之后没人更新它，于是套件一直红着。**这不是本轮引入的**，但本轮必须修，否则"e2e 全绿"这个验收条件无从满足。

两处要改：

1. `DEFAULT_MODEL_COST` 改成 `7`。保留硬编码（原作者刻意如此，为的是让改价大声失败），只更正数值。
2. `GRANTED_CREDITS` 从 `10` 提到 `30`。历史页的翻页用例要生成 3 张，3 × 7 = 21 > 10，不提就会在第二张 402。发放量与单价解耦不了，就至少留够余量。

改完再跑一遍，确认 12 条全绿之后才开始写新用例——否则新用例的失败会和这两条既有失败混在一起。

- [ ] **Step 3：写历史页用例**

Create `e2e/history.spec.ts`。选择器沿用 `generate.spec.ts` 的既有 testid（`prompt-input`、`result-image`）与生成按钮正则，不要另起一套：

```ts
import { test, expect, type Page } from "@playwright/test";

import { signUp } from "./accounts";

/**
 * 历史页的端到端覆盖。跑在**真实 Go 后端**上，后端须为 stub 模式
 * （不配 FLUX_API_KEY）。prompt 里带 `quick` 走 200 毫秒路径。
 *
 * 后端也**不会**配 R2（e2e 环境没有凭证），加上 stub 返回的是相对路径，
 * 所以这里生成出来的每一条都必然是 stored=false——「链接可能已失效」提示因此是
 * 可断言的，而它正好守住了 stored 字段从后端一路透到 UI 的完整链路。
 */

/** 生成按钮。文案是 `Generate ◆ 1`；顶栏那个 "Generate" 是 role=link，不会撞上。 */
function generateButton(page: Page) {
  return page.getByRole("button", { name: /^Generate/ });
}

/** 生成一张图并等它出图。 */
async function generateOnce(page: Page, prompt: string) {
  await page.goto("/generate");
  await page.getByTestId("prompt-input").fill(prompt);
  await generateButton(page).click();
  await expect(page.getByTestId("result-image")).toBeVisible({ timeout: 20_000 });
}

test("未登录访问 /history 跳登录", async ({ page }) => {
  await page.goto("/history");
  await expect(page).toHaveURL(/\/login/);
});

test("生成一张后能在历史里看到它，并提示链接可能失效", async ({ page }) => {
  await signUp(page, "hist");
  await generateOnce(page, "quick cat on a roof");

  await page.goto("/history");
  // 卡片的 alt 就是 prompt。
  await expect(page.getByAltText("quick cat on a roof")).toBeVisible();
  // e2e 后端没配 R2，必然未转存——提示必须出现。链路上任何一环漏了 stored，
  // 这条就会失败。
  await expect(page.getByTestId("temporary-link-warning").first()).toBeVisible();
});

test("失败的生成在历史里显示未扣次数", async ({ page }) => {
  await signUp(page, "hist-fail");

  await page.goto("/generate");
  await page.getByTestId("prompt-input").fill("fail on purpose");
  await generateButton(page).click();
  // 失败路径不出图，等失败文案出现即可（stub 的 fail 关键词是 800ms）。
  await expect(page.getByTestId("result-image")).toHaveCount(0, { timeout: 20_000 });

  await page.goto("/history");
  await expect(page.getByText("No credits were charged.").first()).toBeVisible();
});

test("翻页不重不漏，最后一页 nextCursor 为 null", async ({ page }) => {
  await signUp(page, "hist-page");
  for (const p of ["quick one", "quick two", "quick three"]) {
    await generateOnce(page, p);
  }

  // 首屏默认 limit=20 会一次给完，所以分页语义直接打接口验证。
  // 用 page.request 而不是 request fixture：前者一定带上 page 的 httpOnly cookie。
  const first = await page.request.get("/api/generations?limit=2");
  expect(first.ok()).toBeTruthy();
  const firstPage = await first.json();
  expect(firstPage.generations).toHaveLength(2);
  expect(firstPage.nextCursor).toBeTruthy();

  const second = await page.request.get(
    `/api/generations?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor)}`,
  );
  const secondPage = await second.json();
  expect(secondPage.generations).toHaveLength(1);
  expect(secondPage.nextCursor).toBeNull();

  const ids = [...firstPage.generations, ...secondPage.generations].map(
    (g: { id: string }) => g.id,
  );
  expect(new Set(ids).size, `两页之间有重复：${ids.join(",")}`).toBe(3);
});

test("「加载更多」按钮能追加下一页", async ({ page }) => {
  await signUp(page, "hist-more");
  for (const p of ["quick alpha", "quick beta"]) {
    await generateOnce(page, p);
  }

  // 默认 limit 是 20，两条一屏就给完了，按钮不该出现——这本身就是个断言：
  // 无条件渲染「加载更多」会让用户点一个什么都不会发生的按钮。
  await page.goto("/history");
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  await expect(page.getByAltText("quick alpha")).toBeVisible();
  await expect(page.getByAltText("quick beta")).toBeVisible();
});

test.describe("移动端（375×667）", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("历史页在窄屏下两列且无横向溢出", async ({ page }) => {
    await signUp(page, "hist-m");
    await generateOnce(page, "quick mobile cat");

    await page.goto("/history");
    await expect(page.getByAltText("quick mobile cat")).toBeVisible();

    // 横向溢出是窄屏最常见也最难靠肉眼发现的回归：一个漏写 sm: 前缀的定宽
    // 在桌面端完全看不出来。
    const m = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(
      m.scrollWidth,
      `横向溢出：scrollWidth=${m.scrollWidth} > innerWidth=${m.innerWidth}`,
    ).toBeLessThanOrEqual(m.innerWidth);
  });
});
```

**关于「加载更多」的真实翻页：** 上面那条只断言了按钮在没有下一页时不出现。要真正驱动按钮翻页，需要一个账号攒够 21 条记录，而每条至少 200ms 加一次页面导航——用例会跑到分钟级。分页语义已由前一条接口用例覆盖，按钮的点击行为由 `HistoryGrid` 的 `loadMore` 承担。**这是一处刻意的覆盖缺口，不要假装它被测到了。** 若要补，正确做法是加一个直接往数据库插 21 行的后端测试夹具接口，而那超出本轮范围。

- [ ] **Step 4：跑新用例**

先确保 Go 后端在跑（`e2e/global-setup.ts` 会断言可达并 bootstrap 管理员，不可达就直接失败），且**没有配 `R2_*`**（否则「链接可能已失效」那条会失败——而那是正确的失败，说明转存生效了）。

Run: `npm run test:e2e -- e2e/history.spec.ts`
Expected: 6 个用例全 PASS。

- [ ] **Step 5：实机截图确认（375×667）**

**不能只看用例通过就算完**——溢出断言过不代表版式好看。在移动端那条用例末尾临时加：

```ts
await page.screenshot({ path: "history-375.png", fullPage: true });
```

Run: `npm run test:e2e -- e2e/history.spec.ts -g "移动端"`

然后**用 Read 工具打开 `history-375.png` 人眼看一遍**：两列是否真的成立、prompt 有没有被截断成看不懂、提示条有没有把卡片挤歪、图片有没有变形。确认后删掉截图代码与 png 文件。

- [ ] **Step 6：跑全量 e2e 并提交**

Run: `npm run test:e2e`
Expected: 既有 12 个 + 新增 6 个全 PASS。

```bash
git add e2e/accounts.ts e2e/history.spec.ts e2e/generate.spec.ts
git commit -m "test: 历史页端到端覆盖，含 375×667 布局；账号夹具抽成 e2e/accounts.ts"
```

---

## 前端完成检查

- [ ] `npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build` 全绿
- [ ] `npm run test:e2e` 全绿（既有 12 个 + 新增 6 个）
- [ ] 四语 key 集合一致（Task 3 Step 2 的脚本无输出）
- [ ] 375×667 实机截图人眼确认过
- [ ] 手工走一遍四种语言的 `/history`（`/history`、`/zh/history`、`/ja/history`、`/ko/history`），确认没有英文漏网文案

## 已知遗留（不在本轮）

- **ja/ko 译文未经母语审校。** 本轮新增的 `History` 命名空间同样如此，不假装它是完成的。
- 后端错误 `message` 仍以英文穿透。历史页刻意不显示后端原文（用本地化的 `loadError`），但其他页面的问题依旧。
- 图片没有懒加载占位骨架，慢网下会看到空白格子。
- 没有删除、收藏、搜索、按模型筛选——都不服务于"拿回自己的图"这个目标（设计文档 §2.4）。
- 公开画廊（`isPublic` 的读路径）未做，该字段仍是只写。

# 复刻 Cloudflare Kumo 设计体系 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 image-front 前端的观感换成 Cloudflare Dashboard 所用的 Kumo 设计体系——紧凑字号、中性灰表面层级、蓝色主色、可用的明暗双主题。

**Architecture:** 只替换 Tailwind v4 的 token 层取值，**保留 shadcn 的全部变量名**（`--background` / `--card` / `--primary` …），Kumo 特有的表面与语义色作为新增 token 并列。组件结构不动，仅把绕过 token 的字面色改回语义类。不安装 `@cloudflare/kumo`。

**Tech Stack:** Next 16.2.12 / React 19 / Tailwind v4 / `@base-ui/react` / shadcn(`base-nova`) / next-intl 四语 / Vitest(node) / Playwright

**设计文档:** `docs/superpowers/specs/2026-08-02-kumo-design-system-design.md`

---

## 前置须知

**主题测试免后端，其余 e2e 仍需后端。** Task 0 会新增
`playwright.theme.config.ts`（不带 `globalSetup`），主题/token 的红绿环节全程
用 `npm run test:theme` 跑，不需要 Go 后端。而 `e2e/auth|generate|history|admin-settings`
这四个 spec 走真实后端，主配置的 `globalSetup` 会断言后端可达、不可达时大声失败。
**后端没起时，涉及这四个 spec 的步骤明确标了"需后端"，可以跳过并在 Task 10 统一补跑。**
后端须为 stub 模式（**不配** `FLUX_API_KEY`），地址默认 `http://localhost:8080`。

**dev server 复用不会重编译。** `reuseExistingServer: !process.env.CI`。改完前端若
复用了旧 server，测的是旧代码。改 `globals.css` 或 `layout.tsx` 后**重启 dev server**。

**Vitest 是 node 环境**（`vitest.config.ts`: `environment: "node"`，只收
`tests/**/*.test.ts`）。没有 jsdom，组件与 CSS 无法单测。因此本计划的验证分工是：
token 与视觉走 Playwright，字面色守卫走 node 环境的文件扫描单测。不要为了测 CSS
去引 jsdom——那是与目标无关的依赖。

## 文件结构

**新建：**

| 文件 | 职责 |
|---|---|
| `playwright.theme.config.ts` | 免后端的 Playwright 配置，只收 `theme.spec.ts` |
| `e2e/theme.spec.ts` | 断言字体真的解析、基准字号 14px、主色为蓝、明暗切换与持久化。只走公开页 `/login`，不注册账号 |
| `tests/design-tokens.test.ts` | 扫描 `components/`、`app/` 的 `.tsx`，断言不含 Tailwind 调色板字面色。防回归常驻 |
| `components/theme-toggle.tsx` | 客户端组件：明暗切换按钮。`SiteHeader` 是 async 服务端组件，切换逻辑必须单独成文件 |

**修改：**

| 文件 | 改动 |
|---|---|
| `package.json` | 加 `test:theme` script |
| `app/globals.css` | token 层全量改写：字体、字号、表面层级、主色、语义色、圆角 |
| `app/[locale]/layout.tsx` | Geist → Inter；加防闪 inline script |
| `components/site-header.tsx` | 放入 `<ThemeToggle />` |
| `messages/{en,zh,ja,ko}.json` | `Nav.theme` 四语文案 |
| 11 个含字面色的文件 | 字面色 → 语义类（见 Task 6、Task 7） |

---

## 阶段零：让主题测试不依赖后端

### Task 0: 免后端的 Playwright 配置

主题 token 是纯前端的，验证它不该需要 Go 后端。共用主配置的结果是后端没起时
连一条纯 CSS 断言都跑不了——这会让后面所有红绿环节失效。

**Files:**
- Create: `playwright.theme.config.ts`
- Modify: `package.json`（scripts）

- [ ] **Step 1: 建配置**

创建 `playwright.theme.config.ts`：

```ts
import { defineConfig, devices } from "@playwright/test";

/**
 * 主题 / 设计 token 的专用配置——**刻意不带 globalSetup**。
 *
 * 主配置的 globalSetup 会断言 Go 后端可达并引导管理员账号（发次数需要管理员）。
 * 但 token 是纯前端的，验证它只需要 Next dev server。共用主配置的代价是：
 * 后端没起时，一条纯 CSS 断言也跑不了。
 *
 * 只收 e2e/theme.spec.ts。其余 spec 都要真实后端，仍走 playwright.config.ts——
 * theme.spec.ts 同时也在主配置的收集范围内，`npm run test:e2e` 会再跑一遍，
 * 这是刻意的：CI 一条命令就能全覆盖，不必记住要跑两个配置。
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /theme\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 2: 加 npm script**

在 `package.json` 的 `scripts` 中，`test:e2e` 之后加一行：

```json
    "test:theme": "playwright test --config=playwright.theme.config.ts"
```

- [ ] **Step 3: 确认配置能被识别**

此时 `e2e/theme.spec.ts` 还不存在，预期是"没找到测试"而**不是**配置报错：

```bash
npm run test:theme
```

Expected: 报 `Error: No tests found`（或 0 passed），**不应**出现
`globalSetup` 相关的后端不可达错误。看到后端错误说明配置没生效。

- [ ] **Step 4: 提交**

```bash
git add playwright.theme.config.ts package.json
git commit -m "test: 主题测试专用的免后端 Playwright 配置

主配置的 globalSetup 断言 Go 后端可达，但 token 是纯前端的。共用的代价是
后端没起时一条纯 CSS 断言也跑不了。"
```

---

## 阶段一：Token 层

### Task 1: e2e 断言字体真的生效（红）

这条守住设计文档记录的缺陷 1：`globals.css:10` 的 `--font-sans: var(--font-sans)`
是自引用，解析为无效值，**Geist 至今从未生效**，页面在用浏览器默认字体。

**Files:**
- Create: `e2e/theme.spec.ts`

- [ ] **Step 1: 写下失败的测试**

创建 `e2e/theme.spec.ts`：

```ts
import { expect, test } from "@playwright/test";

/**
 * Kumo 设计 token 的端到端覆盖。
 *
 * 刻意只走 `/login` 这类**公开页**：token 是全局的，验证它不需要登录态，
 * 而注册账号要真实后端发次数，把一条纯样式断言拖进业务链路不值得。
 *
 * 字体与字号用 getComputedStyle 断言**真实解析结果**而不是读 CSS 变量——
 * 改动前的 bug 恰恰是变量写了、但自引用导致解析失败，读变量读不出来。
 */

// 默认亮色，让 .dark 的断言可判定（防闪 script 在没有 localStorage 时
// 会回退到 prefers-color-scheme）。
test.use({ colorScheme: "light" });

test("正文字体解析到 Inter", async ({ page }) => {
  await page.goto("/login");
  const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(family).toMatch(/Inter/);
});
```

- [ ] **Step 2: 跑它，确认它失败**

不需要后端，直接跑：

```bash
npm run test:theme
```

Expected: FAIL。实际 `fontFamily` 是浏览器默认字体（如 `"Times New Roman"`），
不含 `Inter`。这正是缺陷 1 的现场证据。

- [ ] **Step 3: 提交这条红测试**

```bash
git add e2e/theme.spec.ts
git commit -m "test: e2e 断言正文字体真的解析生效

当前是红的。globals.css 里 --font-sans 自引用，解析为无效值，Geist 从未生效。"
```

---

### Task 2: 换 Inter 并修掉自引用（绿）

**Files:**
- Modify: `app/[locale]/layout.tsx:10-18`（字体声明）、`:51-54`（html className）
- Modify: `app/globals.css:10-12`（`@theme inline` 中的字体 token）

- [ ] **Step 1: 换字体声明**

把 `app/[locale]/layout.tsx` 第 10-18 行的两段字体声明替换为：

```tsx
// Kumo 用 Inter。等宽字体它用的是 Cloudflare 私有的 Paper Mono，外部拿不到，
// 用 Geist Mono 顶——同为中性偏方的 grotesk mono，观感最接近，且本就已装。
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
```

并把第 2 行的 import 改为：

```tsx
import { Geist_Mono, Inter } from "next/font/google";
```

- [ ] **Step 2: 换 html 上的 className**

`app/[locale]/layout.tsx` 第 51-54 行，把 `geistSans.variable` 换成 `inter.variable`：

```tsx
    <html
      lang={locale}
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
```

- [ ] **Step 3: 修掉 globals.css 的自引用**

把 `app/globals.css` 第 10-12 行（`--font-sans` / `--font-mono` / `--font-heading`
三行）替换为：

```css
  /* 这里**不能**写 `--font-sans: var(--font-sans)`——自引用会解析为无效值，
     整站掉回浏览器默认字体（改动前正是这个状态，且没人发现）。
     next/font 把实际字体名注入到 <html> 上的 --font-inter。 */
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
  --font-heading: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
```

- [ ] **Step 4: 重启 dev server 并跑测试**

改了 `globals.css` 与 `layout.tsx`，必须重启 dev server（否则复用的旧 server 跑的是旧代码）。

```bash
npm run test:theme
```

Expected: PASS（1 passed）。

- [ ] **Step 5: 提交**

```bash
git add app/globals.css "app/[locale]/layout.tsx"
git commit -m "fix: 正文换 Inter，并修掉 --font-sans 自引用

自引用让 font-sans 解析为无效值，Geist 从来没生效过，页面一直在用浏览器
默认字体。等宽保留 Geist Mono：Kumo 用的 Paper Mono 是 Cloudflare 私有字体。"
```

---

### Task 3: e2e 断言 14px 基准字号（红）

Kumo 的信息密度主要来自字号，`base` 是 14px 而非 Tailwind 默认的 16px。
这一条比颜色更决定"是否像后台"。

**Files:**
- Modify: `e2e/theme.spec.ts`（追加）

- [ ] **Step 1: 追加失败的测试**

在 `e2e/theme.spec.ts` 末尾追加：

```ts
test("基准字号为 Kumo 的 14px", async ({ page }) => {
  await page.goto("/login");
  const size = await page.evaluate(() => getComputedStyle(document.body).fontSize);
  expect(size).toBe("14px");
});
```

- [ ] **Step 2: 跑它，确认它失败**

```bash
npm run test:theme
```

Expected: FAIL，`expected "14px", received "16px"`。

- [ ] **Step 3: 改字号与圆角 token**

在 `app/globals.css` 的 `@theme inline` 块内，紧跟字体三行之后插入：

```css
  /* Kumo 的紧凑字号。行高比值照抄 Kumo 实测值，不要换成整数。 */
  --text-xs: 12px;
  --text-xs--line-height: calc(1 / 0.75);
  --text-sm: 13px;
  --text-sm--line-height: calc(1 / 0.85);
  --text-base: 14px;
  --text-base--line-height: calc(1.25 / 0.875);
  --text-lg: 16px;
  --text-lg--line-height: calc(1.25 / 1);
```

`xl` 及以上沿用 Tailwind 默认，不动。

- [ ] **Step 4: 让 body 真的用上 14px**

改 `--text-base` 只影响 `text-base` 工具类；body 默认继承 html 的 16px。
把 `app/globals.css` 末尾 `@layer base` 里的 body 规则改成：

```css
  body {
    @apply bg-background text-foreground text-base;
  }
```

- [ ] **Step 5: 圆角收紧**

把 `:root` 中的 `--radius: 0.625rem;` 改为：

```css
  --radius: 0.5rem;
```

`@theme inline` 里 `--radius-sm/md/lg/xl/2xl/3xl/4xl` 的 `calc()` 派生关系不动。

- [ ] **Step 6: 重启 dev server，跑测试**

```bash
npm run test:theme
```

Expected: PASS（2 passed）。

- [ ] **Step 7: 提交**

```bash
git add app/globals.css
git commit -m "feat: Kumo 的紧凑字号与收紧的圆角

base 14px / sm 13px / xs 12px，行高比值照抄 Kumo 实测值。字号是 Kumo
信息密度的主要来源，比颜色更决定观感。radius 0.625rem -> 0.5rem。"
```

---

### Task 4: e2e 断言主色为蓝而非近黑（红）

**Files:**
- Modify: `e2e/theme.spec.ts`（追加）

- [ ] **Step 1: 追加失败的测试**

在 `e2e/theme.spec.ts` 末尾追加。断言蓝通道显著高于红通道，而不是断言精确
rgb 值——OKLCH 到 sRGB 的取整因浏览器而异，精确值会脆：

```ts
test("主按钮是蓝色而非近黑", async ({ page }) => {
  await page.goto("/login");
  // 顶栏那个 "Sign in" 是 role=link，这里取的是表单提交按钮，不会撞上。
  const submit = page.getByRole("button", { name: "Sign in" });
  const bg = await submit.evaluate((el) => getComputedStyle(el).backgroundColor);
  const [r, , b] = bg.match(/\d+/g)!.map(Number);
  // 改动前是近黑 oklch(0.205 0 0)，三通道相等且都很小，两条都不满足。
  expect(b).toBeGreaterThan(r + 40);
  expect(b).toBeGreaterThan(120);
});
```

- [ ] **Step 2: 跑它，确认它失败**

```bash
npm run test:theme
```

Expected: FAIL。近黑主色下 `r ≈ b ≈ 32`，`b > r + 40` 不成立。

- [ ] **Step 3: 改写 `:root` 的全部取值**

把 `app/globals.css` 中整个 `:root { ... }` 块（原第 51-84 行）替换为：

```css
:root {
  /* 表面层级：canvas(页面底) < elevated < recessed，base(卡片面) 为纯白。
     亮色下卡片比页面底更亮，暗色下这个关系会反过来，见 .dark。 */
  --background: oklch(98.75% 0 0);
  --foreground: oklch(21% 0.006 285.885);
  --card: #fff;
  --card-foreground: oklch(21% 0.006 285.885);
  --popover: #fff;
  --popover-foreground: oklch(21% 0.006 285.885);
  --elevated: oklch(98% 0 0);
  --recessed: oklch(96% 0 0);

  /* 交互主色是**蓝**。橙色 #f6821f 在 Kumo 里只用于 logo 与品牌文字，
     不承担任何交互语义，见下面的 --brand。 */
  --primary: oklch(57.72% 0.2324 260);
  --primary-foreground: oklch(98.5% 0 0);

  --secondary: oklch(92.2% 0 0);
  --secondary-foreground: oklch(21% 0.006 285.885);
  --muted: oklch(97% 0 0);
  --muted-foreground: oklch(55.6% 0 0);
  --accent: oklch(97% 0 0);
  --accent-foreground: oklch(21% 0.006 285.885);

  /* 描边用半透明黑而不是实色灰——叠在不同底色上更自然，这是 Kumo 的做法。 */
  --border: oklch(14.5% 0 0 / 0.1);
  --input: oklch(14.5% 0 0 / 0.1);

  /* 焦点环刻意**不用**主色。中性环在任何底色上都可见，蓝环压在蓝按钮上会消失。
     Kumo 的 --color-kumo-focus 就是近黑，不要顺手改成 primary。 */
  --ring: oklch(15% 0 0);

  /* 品牌橙，仅点缀 */
  --brand: #f6821f;

  /* 语义色 + tint 底色 */
  --info: oklch(42.4% 0.199 265.638);
  --info-tint: oklch(93.2% 0.032 255.585);
  --success: oklch(43.2% 0.095 166.913);
  --success-tint: oklch(95% 0.052 163.051);
  --warning: oklch(47.6% 0.114 61.907);
  --warning-tint: oklch(97.3% 0.071 103.193);
  --danger: oklch(50.5% 0.213 27.518);
  --danger-tint: oklch(93.6% 0.032 17.717);
  /* shadcn 的既有名字，取 danger 值，保持两者一致 */
  --destructive: oklch(50.5% 0.213 27.518);

  --radius: 0.5rem;

  /* chart-* 本项目暂无图表在用，沿用原值，不在本次范围内 */
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);

  --sidebar: oklch(98% 0 0);
  --sidebar-foreground: oklch(21% 0.006 285.885);
  --sidebar-primary: oklch(57.72% 0.2324 260);
  --sidebar-primary-foreground: oklch(98.5% 0 0);
  --sidebar-accent: oklch(97% 0 0);
  --sidebar-accent-foreground: oklch(21% 0.006 285.885);
  --sidebar-border: oklch(14.5% 0 0 / 0.1);
  --sidebar-ring: oklch(15% 0 0);
}
```

- [ ] **Step 4: 改写 `.dark` 的全部取值**

把整个 `.dark { ... }` 块（原第 86-118 行）替换为：

```css
.dark {
  /* 注意方向**反转**：canvas 是最深的，卡片向上"浮起"为更亮的灰。
     照抄亮色的深浅关系会做反。 */
  --background: oklch(10% 0 0);
  --foreground: oklch(97% 0 0);
  --card: oklch(17% 0 0);
  --card-foreground: oklch(97% 0 0);
  --popover: oklch(17% 0 0);
  --popover-foreground: oklch(97% 0 0);
  --elevated: oklch(12% 0 0);
  --recessed: oklch(15% 0 0);

  --primary: oklch(51.948% 0.2324 260);
  --primary-foreground: oklch(98.5% 0 0);

  --secondary: oklch(26.9% 0 0);
  --secondary-foreground: oklch(97% 0 0);
  --muted: oklch(26.9% 0 0);
  --muted-foreground: oklch(70.8% 0 0);
  --accent: oklch(26.9% 0 0);
  --accent-foreground: oklch(97% 0 0);

  /* 暗色下改用实色灰描边：半透明黑在深底上等于看不见 */
  --border: oklch(32% 0 0);
  --input: oklch(32% 0 0);
  --ring: oklch(93.5% 0 0);

  --brand: #f6821f;

  --info: oklch(70.7% 0.165 254.624);
  --info-tint: oklch(37.9% 0.146 265.522);
  --success: oklch(59.6% 0.145 163.225);
  --success-tint: oklch(37.8% 0.077 168.94);
  --warning: oklch(85.2% 0.199 91.936);
  --warning-tint: oklch(55.4% 0.135 66.442);
  --danger: oklch(70.4% 0.191 22.216);
  --danger-tint: oklch(39.6% 0.141 25.723);
  --destructive: oklch(70.4% 0.191 22.216);

  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);

  --sidebar: oklch(12% 0 0);
  --sidebar-foreground: oklch(97% 0 0);
  --sidebar-primary: oklch(51.948% 0.2324 260);
  --sidebar-primary-foreground: oklch(98.5% 0 0);
  --sidebar-accent: oklch(26.9% 0 0);
  --sidebar-accent-foreground: oklch(97% 0 0);
  --sidebar-border: oklch(32% 0 0);
  --sidebar-ring: oklch(93.5% 0 0);
}
```

- [ ] **Step 5: 在 `@theme inline` 中注册新增 token**

新增的表面、品牌、语义色必须注册，Tailwind 才会生成 `bg-elevated`、
`text-warning`、`bg-danger-tint` 这类工具类。**不注册的话 Task 6-7 的替换会静默失效**
（类名写了但没有对应 CSS）。在 `@theme inline` 块内 `--color-foreground` 之后插入：

```css
  --color-elevated: var(--elevated);
  --color-recessed: var(--recessed);
  --color-brand: var(--brand);
  --color-info: var(--info);
  --color-info-tint: var(--info-tint);
  --color-success: var(--success);
  --color-success-tint: var(--success-tint);
  --color-warning: var(--warning);
  --color-warning-tint: var(--warning-tint);
  --color-danger: var(--danger);
  --color-danger-tint: var(--danger-tint);
```

- [ ] **Step 6: 重启 dev server，跑测试**

```bash
npm run test:theme
```

Expected: PASS（3 passed）。

- [ ] **Step 7: 确认新工具类真的生成了**

这一步防的是 Step 5 漏掉导致 Task 8 静默失效。临时在 `/login` 页验证：

```bash
node -e "
const http=require('http');
http.get('http://localhost:3000/en/login',(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{
  const m=d.match(/href=\"([^\"]*\.css[^\"]*)\"/g);
  console.log('css links:', m);
});});
"
```

然后 curl 该 CSS 并搜索 `--color-warning`：

```bash
curl -s http://localhost:3000/<上一步得到的css路径> | grep -c "color-warning"
```

Expected: 输出 ≥ 1。若为 0，Step 5 没生效，回去检查。

- [ ] **Step 8: 提交**

```bash
git add app/globals.css
git commit -m "feat: Kumo 的表面层级、蓝色主色与语义色 token

数值从 dash.cloudflare.com 的 CSS 实测提取。三处易做错的地方已加注释：
暗色下表面深浅关系反转、描边亮色用半透明黑暗色用实色灰、焦点环刻意用
中性色而非主色（蓝环压在蓝按钮上会消失）。"
```

---

## 阶段二：去硬编码

### Task 5: 字面色守卫单测（红）

**Files:**
- Create: `tests/design-tokens.test.ts`

- [ ] **Step 1: 写下失败的测试**

创建 `tests/design-tokens.test.ts`：

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 守住"颜色只走语义 token"这条规则。
 *
 * 为什么要一条常驻测试而不是改完人工检查一遍：字面色（bg-neutral-50 之类）在
 * 亮色下看着没问题，坏的只有暗色——而暗色是要手动切过去才看得见的。
 * 回流一处，代价是某个页面在暗色下白底白字，而没人会注意到。
 *
 * `components/ui/` 里 shadcn 原语形如 `dark:bg-input/30` 的写法是**合法的**：
 * 那是语义变量加透明度微调，不是字面色，本规则不会误伤。
 */

const ROOTS = ["components", "app"];

const PALETTE = [
  "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber",
  "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue",
  "indigo", "violet", "purple", "fuchsia", "pink", "rose",
].join("|");

const UTILITY = [
  "bg", "text", "border", "ring", "from", "via", "to", "outline",
  "decoration", "divide", "fill", "stroke", "caret", "placeholder", "shadow",
].join("|");

const LITERAL_COLOR = new RegExp(`\\b(?:${UTILITY})-(?:${PALETTE})-\\d{2,3}\\b`, "g");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsxFiles(full));
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("设计 token 守卫", () => {
  it("组件与页面里不出现 Tailwind 调色板字面色", () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of tsxFiles(root)) {
        const lines = readFileSync(file, "utf8").split(/\r?\n/);
        lines.forEach((line, i) => {
          const hits = line.match(LITERAL_COLOR);
          if (hits) offenders.push(`${file}:${i + 1}  ${hits.join(" ")}`);
        });
      }
    }

    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑它，确认它失败**

```bash
npx vitest run tests/design-tokens.test.ts
```

Expected: FAIL，列出 23 处。应当覆盖这 11 个文件：
`components/history-card.tsx`（25, 26, 29, 32, 38, 54, 57, 63）、
`components/account/subscription-card.tsx`（93, 105, 125）、
`components/generate/result-panel.tsx`（69, 71）、
`components/history-grid.tsx`（53, 73）、
`components/settings-form.tsx`（261, 325）、
`components/auth-form.tsx`（118）、
`components/logout-button.tsx`（44）、
`components/account/manage-subscription-button.tsx`（87）、
`components/pricing/plan-cards.tsx`（136）、
`app/[locale]/history/page.tsx`（41）、
`app/[locale]/login/page.tsx`（14）。

`components/ui/` 下的四个原语**不应**出现在列表里（已核实它们全走语义变量）。
若出现了，说明 shadcn 版本变动引入了字面色，先停下来告知，不要擅自加例外。

- [ ] **Step 3: 提交这条红测试**

```bash
git add tests/design-tokens.test.ts
git commit -m "test: 守住颜色只走语义 token

当前是红的，11 个文件 23 处字面色。加常驻测试而非人工检查一次：字面色在
亮色下看着正常，坏的只有暗色，回流一处就是某页白底白字而没人注意。"
```

---

### Task 6: 清理 history 相关文件（绿其一）

字面色最密集的三处，一起改。

**Files:**
- Modify: `components/history-card.tsx:25,26,29,32,38,54,57,63`
- Modify: `components/history-grid.tsx:53,73`
- Modify: `app/[locale]/history/page.tsx:41`

- [ ] **Step 1: 改 `components/history-card.tsx`**

第 25-26 行（失败态的 `<li>` 与灰格子）：

```tsx
      <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <div className="flex aspect-square items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
```

第 29 行、第 54 行（两处 prompt 文本，内容相同）：

```tsx
        <p className="line-clamp-2 text-sm text-foreground">
```

第 32 行、第 57 行（两处次要说明文本）：

```tsx
        <p className="text-xs text-muted-foreground">
```

第 38 行（成功态的 `<li>`）：

```tsx
    <li className="flex flex-col gap-2 rounded-lg border border-border p-3">
```

第 63 行（临时链接警告）：

```tsx
          className="text-xs text-warning"
```

- [ ] **Step 2: 改 `components/history-grid.tsx`**

第 53 行：

```tsx
        <p className="text-muted-foreground">{t("empty")}</p>
```

第 73 行：

```tsx
        <p role="alert" className="text-sm text-danger">
```

- [ ] **Step 3: 改 `app/[locale]/history/page.tsx`**

第 41 行：

```tsx
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
```

- [ ] **Step 4: 跑守卫测试，确认这三个文件已不在列表**

```bash
npx vitest run tests/design-tokens.test.ts
```

Expected: 仍 FAIL，但剩余 offender 只应有 8 个文件的 12 处
（`subscription-card` 3、`result-panel` 2、`settings-form` 2、`auth-form` 1、
`logout-button` 1、`manage-subscription-button` 1、`plan-cards` 1、`login/page` 1）。
`history-card`、`history-grid`、`history/page` 三者不应再出现。

- [ ] **Step 5: 跑历史页 e2e，确认没改坏（需后端，可跳过）**

后端未起时跳过本步，Task 10 会统一补跑。后端在跑时：

```bash
npx playwright test e2e/history.spec.ts --reporter=line
```

Expected: PASS。特别是 `temporary-link-warning` 那条——它的 `data-testid`
没动，只换了 className。

- [ ] **Step 6: 提交**

```bash
git add components/history-card.tsx components/history-grid.tsx "app/[locale]/history/page.tsx"
git commit -m "refactor: history 相关文件的字面色换成语义 token"
```

---

### Task 7: 清理剩余 8 个文件（绿其二）

**Files:**
- Modify: `components/account/subscription-card.tsx:93,105,125`
- Modify: `components/generate/result-panel.tsx:69,71`
- Modify: `components/settings-form.tsx:261,325`
- Modify: `components/auth-form.tsx:118`
- Modify: `components/logout-button.tsx:44`
- Modify: `components/account/manage-subscription-button.tsx:87`
- Modify: `components/pricing/plan-cards.tsx:136`
- Modify: `app/[locale]/login/page.tsx:14`

- [ ] **Step 1: 三处纯红色错误文本**

`components/auth-form.tsx:118`、`components/logout-button.tsx:44`、
`components/account/manage-subscription-button.tsx:87` —— 三处都是
`text-red-600`，改成 `text-danger`。注意
`manage-subscription-button.tsx` 那行还带 `data-testid="portal-error"`，**保留**：

```tsx
        <p role="alert" data-testid="portal-error" className="text-sm text-danger">
```

另两处：

```tsx
        <p role="alert" className="text-sm text-danger">
```

- [ ] **Step 2: 两处 amber 警告框**

`components/account/subscription-card.tsx` 第 93 行与第 125 行，两行内容相同：

```tsx
          className="rounded-md border border-warning/30 bg-warning-tint p-3 text-xs text-warning"
```

- [ ] **Step 3: 三处 red 错误框**

`components/account/subscription-card.tsx:105`：

```tsx
          className="rounded-md border border-danger/30 bg-danger-tint p-3 text-xs text-danger"
```

`components/pricing/plan-cards.tsx:136`：把该行的
`border-red-200 bg-red-50 text-red-700` 三个类替换为
`border-danger/30 bg-danger-tint text-danger`，同行其余类保持原样。

`components/generate/result-panel.tsx:69` 与 `:71` —— 69 行是容器
（`border-red-200 bg-red-50` → `border-danger/30 bg-danger-tint`），
71 行是文字（`text-red-700` → `text-danger`）。同行其余类保持原样。

- [ ] **Step 4: 三处绿色成功提示**

`components/settings-form.tsx:261` 与 `:325`，两处 `text-green-600` → `text-success`。

`app/[locale]/login/page.tsx:14`：`bg-green-50 text-green-700` →
`bg-success-tint text-success`，同行其余类保持原样。

- [ ] **Step 5: 跑守卫测试，确认转绿**

```bash
npx vitest run tests/design-tokens.test.ts
```

Expected: PASS（1 passed）。若仍有 offender，按输出的 `文件:行` 逐一处理。

- [ ] **Step 6: 跑全套单测；相关 e2e 需后端，可跳过**

单测无论如何都要跑：

```bash
npm test
```

后端在跑时再补这两个 spec（覆盖改过的 `auth-form` 与 `settings-form`）；
未起时跳过，Task 10 统一补跑：

```bash
npx playwright test e2e/auth.spec.ts e2e/admin-settings.spec.ts --reporter=line
```

- [ ] **Step 7: 提交**

```bash
git add components/account/subscription-card.tsx components/generate/result-panel.tsx components/settings-form.tsx components/auth-form.tsx components/logout-button.tsx components/account/manage-subscription-button.tsx components/pricing/plan-cards.tsx "app/[locale]/login/page.tsx"
git commit -m "refactor: 剩余 8 个文件的字面色换成语义 token

至此组件层不再有任何 Tailwind 调色板字面色，明暗差异全部由 token 层承担。"
```

---

## 阶段三：明暗切换

### Task 8: e2e 断言切换与持久化（红）

**Files:**
- Modify: `e2e/theme.spec.ts`（追加）

- [ ] **Step 1: 追加失败的测试**

在 `e2e/theme.spec.ts` 末尾追加：

```ts
test("切换按钮能进暗色，且刷新后保持", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  // 刷新后仍是暗色——这条守的是持久化，也顺带守住防闪 script 真的在跑。
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("暗色下页面底色真的变深", async ({ page }) => {
  await page.goto("/login");
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.getByTestId("theme-toggle").click();
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  const lum = (c: string) => c.match(/\d+/g)!.slice(0, 3).reduce((a, v) => a + Number(v), 0);
  // 亮色 canvas 接近白、暗色 canvas 是 oklch(10% 0 0)，差距极大。
  expect(lum(darkBg)).toBeLessThan(lum(lightBg) - 300);
});
```

- [ ] **Step 2: 跑它，确认它失败**

```bash
npm run test:theme
```

Expected: 前 3 条 PASS，后 2 条 FAIL —— 找不到 `theme-toggle`（超时）。

- [ ] **Step 3: 提交这两条红测试**

```bash
git add e2e/theme.spec.ts
git commit -m "test: e2e 断言明暗切换与持久化

当前是红的，还没有切换按钮。暗色样式在项目里写了很久，但从来没有任何地方
给 html 加 .dark，那些 dark: 类一直是死代码。"
```

---

### Task 9: 切换按钮 + 防闪 script + 四语文案（绿）

**Files:**
- Create: `components/theme-toggle.tsx`
- Modify: `components/site-header.tsx:1-7`（import）、`:79`（放入按钮）
- Modify: `app/[locale]/layout.tsx`（`<head>` 加 script）
- Modify: `messages/en.json`、`messages/zh.json`、`messages/ja.json`、`messages/ko.json`

- [ ] **Step 1: 加四语文案**

在四个 `messages/*.json` 的 `Nav` 命名空间内各加一个 `theme` 键（放在
`language` 之后）：

- `en.json`: `"theme": "Toggle theme"`
- `zh.json`: `"theme": "切换主题"`
- `ja.json`: `"theme": "テーマを切り替える"`
- `ko.json`: `"theme": "테마 전환"`

- [ ] **Step 2: 建切换按钮组件**

创建 `components/theme-toggle.tsx`：

```tsx
"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * 明暗切换。
 *
 * 单独成文件是因为 SiteHeader 是 async 服务端组件，装不下 useState。
 *
 * 不引 next-themes：为一个 class 开关加一个运行时依赖不值得。首帧防闪由
 * layout.tsx <head> 里那段同步 script 负责——它必须在 React 之前跑完，
 * 所以那部分逻辑不能挪到这里来。
 *
 * 初始态从**真实 DOM** 读（那段 script 已经把 .dark 设好了），不从
 * localStorage 再读一遍——两边各读一次就会有不一致的可能。
 */
export function ThemeToggle() {
  const t = useTranslations("Nav");
  const [dark, setDark] = useState(false);

  // 服务端渲染时读不到 document，所以初始 false、挂载后立刻对齐真实状态。
  // 图标因此可能有一帧是错的，但 <html> 的 class 由 script 保证从第一帧就对，
  // 页面不会闪白——闪一下图标远比闪一屏白底轻。
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label={t("theme")}
    >
      {dark ? <Moon /> : <Sun />}
    </Button>
  );
}
```

- [ ] **Step 3: 放进顶栏**

`components/site-header.tsx` 的 import 区加一行：

```tsx
import { ThemeToggle } from "@/components/theme-toggle";
```

并在第 79 行 `<LanguageSwitcher />` **之前**插入：

```tsx
          <ThemeToggle />
```

放在语言切换器之前，是为了让这两个"全局偏好"控件相邻，且登录/未登录两种分支
都能拿到它（它在 `signedIn` 三元之外）。

- [ ] **Step 4: 加防闪 script**

`app/[locale]/layout.tsx` 的 `<html>` 与 `<body>` 之间插入 `<head>`：

```tsx
      <head>
        {/*
          必须是**同步**内联 script，且必须在 body 之前跑完：晚一步用户就会看见
          一帧白底再跳成暗色。next/script 的任何 strategy 都不够早，
          所以这里直接用 dangerouslySetInnerHTML，这是它少数正当的用途之一。

          localStorage 缺失时回退到系统偏好，而不是硬写亮色——首次访问的
          暗色偏好用户不该被闪一下。
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
```

`try/catch` 是必要的：隐私模式下 `localStorage` 的访问本身就会抛异常，
不裹的话整段挂掉，连系统偏好那条回退也跟着没了。

- [ ] **Step 5: 重启 dev server，跑测试**

```bash
npm run test:theme
```

Expected: PASS（5 passed）。

- [ ] **Step 6: 确认四语文案没漏**

```bash
node -e "
for (const l of ['en','zh','ja','ko']) {
  const m = require('./messages/'+l+'.json');
  if (!m.Nav || !m.Nav.theme) { console.error('缺 Nav.theme:', l); process.exit(1); }
  console.log(l, '->', m.Nav.theme);
}
console.log('四语齐了');
"
```

Expected: 四行输出 + `四语齐了`。

- [ ] **Step 7: 提交**

```bash
git add components/theme-toggle.tsx components/site-header.tsx "app/[locale]/layout.tsx" messages/en.json messages/zh.json messages/ja.json messages/ko.json
git commit -m "feat: 明暗切换按钮，含防闪 inline script 与四语文案

暗色样式此前一直是死代码——没有任何地方给 html 加 .dark。不引 next-themes：
为一个 class 开关加运行时依赖不值得。防闪 script 必须同步且在 body 前，
next/script 任何 strategy 都不够早。"
```

---

## 收尾

### Task 10: 全量验证

**Files:** 无改动（只跑验证）

- [ ] **Step 1: 全套单测**

```bash
npm test
```

Expected: 全绿，含新增的 `tests/design-tokens.test.ts`。

- [ ] **Step 2: 全套 e2e（需后端）**

确认 Go 后端在跑（stub 模式，不配 `FLUX_API_KEY`），然后：

```bash
npm run test:e2e
```

Expected: 全绿。`auth` / `generate` / `history` / `admin-settings` / `theme` 五个 spec。

后端确实起不来时**不要把这一步打勾**，改为在收尾报告里明确写"e2e 未跑，
原因：后端不可达"，并把免后端的 `npm run test:theme` 与 `npm test` 结果如实列出。
谎报绿比不跑更糟。

- [ ] **Step 3: lint 与构建**

```bash
npm run lint && npm run build
```

Expected: 无 error。`build` 会暴露 `<head>` 里 script 的任何 React 警告。

- [ ] **Step 4: 用 `/verify` 真跑一遍**

调用 `/verify` skill，覆盖矩阵：
`/generate`、`/history`、`/pricing`、`/account` 四个页面 ×
明暗两态 × 1440px 与 375px 两个宽度，逐一截图。

重点看四件事：

1. 暗色下有没有白底白字或看不见的描边（阶段二漏改的字面色会以此暴露）；
2. 375px 下顶栏加了切换按钮后是否还是预期的两行（见 `site-header.tsx`
   里那段关于 `flex-wrap` 的注释，别把它挤坏）；
3. 主按钮是蓝的、品牌橙只出现在 logo 一带；
4. 刷新页面不闪白。

- [ ] **Step 5: 更新设计文档的落地状态**

在 `docs/superpowers/specs/2026-08-02-kumo-design-system-design.md` 末尾追加一节，
记录实际与设计的偏差（若有）。没有偏差就写"按设计落地，无偏差"。

- [ ] **Step 6: 提交**

```bash
git add docs/superpowers/specs/2026-08-02-kumo-design-system-design.md
git commit -m "docs: 记录 Kumo 复刻的落地状态"
```

---

## 自查：本计划对设计文档的覆盖

| 设计文档要求 | 对应任务 |
|---|---|
| 修复字体自引用（缺陷 1） | Task 1-2 |
| 暗色死代码（缺陷 2） | Task 8-9 |
| 字面色（缺陷 3，11 文件 23 处） | Task 5-7 |
| 保留 shadcn 变量名只换值 | Task 4 Step 3-4 |
| 表面层级（含暗色方向反转） | Task 4 Step 3-4 |
| 主色蓝 + 品牌橙仅点缀 | Task 4 Step 3 |
| 焦点环用中性色不用主色 | Task 4 Step 3 |
| 语义色 + tint（明暗各一套） | Task 4 Step 3-4 |
| 语义色注册进 `@theme` | Task 4 Step 5（Step 7 验证真的生成了） |
| 字号 14/13/12/16 | Task 3 |
| 圆角 0.5rem | Task 3 Step 5 |
| Inter + Geist Mono 顶 Paper Mono | Task 2 |
| 明暗切换 + 防闪 + 四语 | Task 9 |
| 验证矩阵（4 页 × 2 态 × 2 宽） | Task 10 Step 4 |
| 主题测试不依赖 Go 后端 | Task 0 |
| 不装 `@cloudflare/kumo` | 全程无新增依赖 |

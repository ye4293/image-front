# 复刻 Cloudflare Kumo 设计体系

日期：2026-08-02

## 背景

目标是让本项目前端呈现 Cloudflare Dashboard 的观感。经查证，该 Dashboard 使用
Cloudflare 自研设计体系 **Kumo**（根节点 `data-theme=kumo`，全部 token 以
`--color-kumo-*` 命名），已作为 `@cloudflare/kumo` 公开发包（v2.9.0，
github.com/cloudflare/kumo）。

本文档中所有 token 数值均从 `https://dash.cloudflare.com/assets/initReact.vU-BYc8G.css`
实测提取，非估计值。

Kumo 的技术底座：Tailwind CSS v4 + `@base-ui/react` + Phosphor Icons + ECharts 6
+ Motion + OKLCH 色彩空间。本项目已经在用 Tailwind v4 与 `@base-ui/react`，
底座一致，因此复刻的工作量集中在 token 层而非组件层。

## 现状与三个既存缺陷

项目现状：Next 16.2.12 / React 19 / Tailwind v4 / `@base-ui/react` /
shadcn（`base-nova` 风格，`neutral` 基色）/ lucide 图标 / next-intl 四语。
`components/ui/` 下仅有 button、card、input、label 四个原语。

复刻过程中必须一并修掉的既存缺陷：

1. **字体变量自引用**。`app/globals.css:10` 写的是 `--font-sans: var(--font-sans)`，
   而 `app/[locale]/layout.tsx` 定义的是 `--font-geist-sans`。两者对不上，
   `font-sans` 工具类解析为无效值，**Geist 字体当前并未生效**，页面实际使用
   浏览器默认字体。
2. **暗色模式是死代码**。`@custom-variant dark (&:is(.dark *))` 与组件中大量
   `dark:` 类均已存在，但代码中没有任何位置给 `<html>` 添加 `.dark`，
   这些样式永不激活。
3. **硬编码字面色绕过语义 token**。11 个文件共 23 处使用 Tailwind 调色板字面色
   （`neutral-*`、`amber-*`、`red-*`、`green-*`）：

   | 文件 | 行 |
   |---|---|
   | `components/history-card.tsx` | 25, 26, 29, 32, 38, 54, 57, 63 |
   | `components/account/subscription-card.tsx` | 93, 105, 125 |
   | `components/generate/result-panel.tsx` | 69, 71 |
   | `components/history-grid.tsx` | 53, 73 |
   | `components/settings-form.tsx` | 261, 325 |
   | `components/auth-form.tsx` | 118 |
   | `components/logout-button.tsx` | 44 |
   | `components/account/manage-subscription-button.tsx` | 87 |
   | `components/pricing/plan-cards.tsx` | 136 |
   | `app/[locale]/history/page.tsx` | 41 |
   | `app/[locale]/login/page.tsx` | 14 |

   只要它们存在，主题就无法切换干净。`components/ui/` 下的四个原语已核实**不含**
   任何字面色，全部走语义变量，无需改动。

## 方案选择

对比过三条路径：

- **A：安装 `@cloudflare/kumo` 直接用其组件。** 否决。需引入 `echarts@6` 与
  `@phosphor-icons/react` 两个 peer 依赖；其自带 Tailwind preset 与现有 shadcn
  `base-nova` 组件的变量契约冲突；且该包跟随 Cloudflare 内部需求演进，
  breaking change 不受本项目控制。
- **B：复刻 token 层，沿用现有 shadcn 组件。** 采纳。底座相同，换 token 即可获得
  绝大部分观感，零新增运行时依赖。
- **C：照 Kumo 结构从零自建组件层。** 否决。需重写 4 个现有组件，观感收益与 B 相同。

### 核心架构决策：扩展而非改名

保留 shadcn 的全部变量名（`--background`、`--card`、`--primary`、`--border`、
`--muted` 等），**只替换其取值**；Kumo 特有的表面层级作为新增 token 并列存在。

理由：现有四个原语以及未来任何 `npx shadcn add` 引入的组件都依赖这套变量名。
若改名为 `--color-kumo-*`，每次新增组件都需手工改写一遍，维护成本持续存在。

## Token 设计

### 表面层级

Kumo 的表面在亮色模式下由浅到深递进（canvas 最浅、contrast 最深），
在暗色模式下方向相反——canvas 最深，卡片向上"浮起"为更亮的灰。两种模式的
数值分别列出：

| 语义 | 映射到 | 亮色 | 暗色 |
|---|---|---|---|
| canvas（页面底） | `--background` | `oklch(98.75% 0 0)` | `oklch(10% 0 0)` |
| base（卡片面） | `--card` / `--popover` | `#fff` | `oklch(17% 0 0)` |
| elevated | 新增 `--elevated` | `oklch(98% 0 0)` | `oklch(12% 0 0)` |
| recessed | 新增 `--recessed` | `oklch(96% 0 0)` | `oklch(15% 0 0)` |
| tint | `--muted` / `--accent` | `oklch(97% 0 0)` | `oklch(26.9% 0 0)` |
| fill | `--secondary` | `oklch(92.2% 0 0)` | `oklch(26.9% 0 0)` |
| line（描边） | `--border` / `--input` | `oklch(14.5% 0 0 / .1)` | `oklch(32% 0 0)` |

亮色描边用半透明黑而非实色灰，叠加在不同底色上更自然，这是 Kumo 的做法，保留。

### 主色与品牌色

| token | 亮色 | 暗色 | 用途 |
|---|---|---|---|
| `--primary` | `oklch(57.72% .2324 260)` | `oklch(51.948% .2324 260)` | 交互主色（按钮、链接、焦点） |
| `--primary-foreground` | `oklch(98.5% 0 0)` | `oklch(98.5% 0 0)` | 主色上的文字 |
| primary hover | `oklch(48.8% .243 264.376)` | 同亮色 | 悬停态 |
| 新增 `--brand` | `#f6821f` | `#f6821f` | **仅品牌点缀**，不作交互色 |

这是观感变化最大的一项：`--primary` 当前为近黑 `oklch(0.205 0 0)`，改为蓝色。
橙色 `#f6821f` 在 Kumo 中仅用于 logo 与品牌文字，不承担任何交互语义，本项目沿用此约定。

**焦点环刻意不用蓝色。** Kumo 的 `--color-kumo-focus` 是近黑
`oklch(15% 0 0)`（暗色下为近白 `oklch(93.5% 0 0)`），而非主色蓝。中性焦点环在任何
底色上都可见，蓝色环压在蓝色按钮上会消失。`--ring` 照此设置，不要顺手改成 primary。

### 语义色

各语义色配一个 `-tint` 弱化底色，用于 badge 与 banner：

| 语义 | 前景（亮/暗） | tint 底色（亮/暗） |
|---|---|---|
| info | `oklch(42.4% .199 265.638)` / `oklch(70.7% .165 254.624)` | `oklch(93.2% .032 255.585)` / `oklch(37.9% .146 265.522)` |
| success | `oklch(43.2% .095 166.913)` / `oklch(59.6% .145 163.225)` | `oklch(95% .052 163.051)` / `oklch(37.8% .077 168.94)` |
| danger | `oklch(50.5% .213 27.518)` / `oklch(70.4% .191 22.216)` | `oklch(93.6% .032 17.717)` / `oklch(39.6% .141 25.723)` |
| warning | `oklch(47.6% .114 61.907)` / `oklch(85.2% .199 91.936)` | `oklch(97.3% .071 103.193)` / `oklch(55.4% .135 66.442)` |

`--destructive` 保留 shadcn 名称，取 danger 值。

四个语义色需在 `@theme inline` 中注册为 `--color-info` / `--color-success` /
`--color-warning` / `--color-danger` 及对应的 `--color-*-tint`，Tailwind 才会生成
`text-warning`、`bg-info-tint` 这类工具类。未注册则组件改造步骤中的
`text-warning` 无效。

### 字号

Kumo 的信息密度主要来自字号，这一项比颜色更决定"是否像后台"：

```
--text-xs:   12px
--text-sm:   13px
--text-base: 14px   ← Tailwind 默认为 16px
--text-lg:   16px
```

`xl` 及以上沿用 Tailwind 默认（`1.25rem` / `1.875rem` …）。行高按 Kumo 压紧到
约 1.25（`--text-base--line-height: calc(1.25 / .875)`）。

### 圆角

`--radius` 从 `0.625rem` 收紧到 `0.5rem`。现有 `@theme inline` 中
`--radius-sm/md/lg` 的 `calc()` 派生关系保持不变，只改基值。

### 字体

- 正文改用 **Inter Variable**（`next/font/google`，变量名 `--font-inter`），
  与 Kumo 一致；同时修复缺陷 1 的自引用。
- 等宽字体：Kumo 使用 Paper Mono，属 Cloudflare 私有字体，无法获取。
  **沿用项目已安装的 Geist Mono** —— 同为中性偏方的 grotesk mono，观感最接近，
  且不新增依赖。

## 组件改造

将上述 11 个文件中的 23 处字面色替换为语义类：

- `text-neutral-600 dark:text-neutral-400` → `text-muted-foreground`
- `text-neutral-500 dark:text-neutral-400` → `text-muted-foreground`
- `text-neutral-700 dark:text-neutral-300` → `text-foreground`
- `border-neutral-200 dark:border-neutral-800` → `border-border`
- `bg-neutral-50 dark:bg-neutral-900` → `bg-card`
- `bg-neutral-100 dark:bg-neutral-800` → `bg-muted`
- `text-red-600 dark:text-red-400` → `text-danger`
- `border-red-200 bg-red-50 text-red-700` → `border-danger/30 bg-danger-tint text-danger`
- `text-amber-700 dark:text-amber-500` → `text-warning`
- `border-amber-200 bg-amber-50 text-amber-800` → `border-warning/30 bg-warning-tint text-warning`
- `bg-green-50 text-green-700` → `bg-success-tint text-success`
- `text-green-600` → `text-success`

此步骤是暗色模式得以成立的前提，非可选项。改造后组件中不应再出现任何 Tailwind
调色板字面色——明暗差异全部由 token 层承担，因此 `dark:` 前缀的颜色类也随之消失。

`components/ui/` 下 shadcn 原语中形如 `dark:bg-input/30` 的写法**保留**：它们用的是
语义变量加透明度微调，不是字面色，且由 shadcn CLI 维护，改了会在下次
`npx shadcn add` 时被覆盖。

守卫方式：新增 `tests/design-tokens.test.ts`，扫描 `components/` 与 `app/` 下所有
`.tsx`，断言不含 Tailwind 调色板字面色。这是一条能长期防回归的规则，
比一次性人工检查可靠。

## 明暗切换

`components/site-header.tsx` 增加一个图标按钮（lucide `Sun` / `Moon`），
点击时切换 `<html>` 的 `.dark` 类并写入 `localStorage`。

在 `app/[locale]/layout.tsx` 的 `<head>` 中插入一段同步 inline script，
在首帧绘制前读取 `localStorage`（缺失时回退到 `prefers-color-scheme`）
并预置 `.dark`，避免刷新时闪白。

不引入 `next-themes`：为单个 class 开关增加一个依赖不值得。

按钮需带 `aria-label`，文案进四语词条（`messages/*.json`）。

## 分阶段落地

三个阶段各自可独立验证：

1. **Token 层**：改写 `app/globals.css` 的 `@theme` 与 `:root` / `.dark` 变量；
   替换字体并修复自引用。此阶段完成后亮色观感即已接近目标。
2. **去硬编码**：清理 11 个文件的 23 处字面色，并加上守卫单测。
3. **切换按钮**：header 按钮 + 防闪 script + 四语文案。

## 验证

- 现有 Vitest 单测与 Playwright e2e 全部通过（`npm test`、`npm run test:e2e`）。
  注意 e2e 的 `globalSetup` 会断言 Go 后端可达，跑 e2e 前必须先起后端（stub 模式，
  不配 `FLUX_API_KEY`）。
- 新增 `e2e/theme.spec.ts`：断言字体真的解析到 Inter（守住缺陷 1 的回归）、
  基准字号为 14px、页面底色为 canvas 值、切换按钮能加上 `.dark` 且刷新后保持。
  该 spec 只走 `/login` 等公开页，不需要注册账号。
- 用 `/verify` 实际驱动应用，覆盖 `/generate`、`/history`、`/pricing`、`/account`
  四个页面 × 明暗两态 × 1440px 与 375px 两个宽度，逐一截图确认。
- 阶段 2 的守卫单测 `tests/design-tokens.test.ts` 常驻，防止字面色回流。
- 阶段 3 完成后，手工验证刷新页面不出现白屏闪烁。

## 明确不做

- 不安装 `@cloudflare/kumo`，不引入 echarts、Phosphor Icons、Motion。
- 不复刻 Kumo 的 `fedramp` 多品牌主题机制——本项目只需一套主题的明暗两态。
- 不新增 shadcn 组件，不重写现有四个原语的结构（仅其取值随 token 变化）。
- 不做与本次观感改造无关的重构。

## 落地状态（2026-08-03）

按设计落地，但有九处偏差，逐条记录。

### 计划外新增

1. **`playwright.theme.config.ts`**。主配置的 `globalSetup` 断言 Go 后端可达，而实施期间
   后端不可用，会卡住全部红/绿环节。token 是纯前端的、本就不该依赖后端，故新增一份不带
   `globalSetup` 的配置（`npm run test:theme`）。这不只是权宜：任何纯 UI 断言以后都受益。

2. **`<html suppressHydrationWarning>`**。设计时没预见到：防闪 script 在 hydrate 前给
   `<html>` 加 `.dark`，而服务端渲染无从知道用户偏好，两边 className 必然不一致，React 报
   hydration mismatch。这是该方案固有的代价，不是 bug。触发面比"点过切换的人"大——任何
   **系统偏好暗色**的用户首次访问就会命中。`next-themes` 的做法相同。

### 与设计不同的实现

3. **`ThemeToggle` 用 `useSyncExternalStore`，不是 `useEffect` + `setState`**。本项目把
   `react-hooks/set-state-in-effect` 设为 error；更根本的是 `.dark` 的真实来源就是 DOM，
   防闪 script 在 React 之前就写了它，再存一份 state 等于两份真相。

4. **暗色 tint 值偏离 Cloudflare 原始提取值**。原始值配我们的中调语义前景只有
   2.6–3.5:1，不过 WCAG AA。根因是配对而非取值：Kumo 在暗色 tint 上用的是 `-200` 级浅色
   前景（`--text-color-kumo-badge-*-subtle`），我们用的是中调语义色本身。故把四个暗色
   tint 压暗到 22–28% 亮度，实测后为 4.55–9.39:1。前景与亮色 tint 均未改动。

5. **失败态历史卡片用 `bg-muted` / `bg-recessed`，不是 `bg-card` / `bg-muted`**。
   原字面色 `neutral-50` 比白页面略暗（下沉感），映射到 `bg-card`（纯白）后反而比页面底
   更亮，深浅关系做反了。改后恢复原有层次，并让此前无消费者的 `--recessed` 有了用处。

6. **e2e 颜色断言必须经 Canvas 归一化**。Chrome 111+ 的 `getComputedStyle().backgroundColor`
   返回原色彩空间记法（`lab(48.3311 …)`），`/\d+/g` 会把小数点两侧拆成多截，算出的通道值
   是垃圾，而垃圾值**可能恰好让断言通过**——假绿。故统一走 1×1 canvas 光栅化。

### 遗留与未验证

7. **`--elevated` 的语义在两个主题下不一致**：亮色下比 canvas 暗、暗色下比 canvas 亮，
   名字只在暗色成立。当前无任何消费者，已在 `:root` 注释中写明"名实对齐前谨慎使用"，
   并指向 `--recessed` / `--muted`。留待首次真正需要时消解。

8. **字号只覆盖到 `text-lg`，`xl` 及以上沿用 Tailwind 默认——这是刻意的**。实测 Kumo 自己
   的 `--text-xl` 就是 `1.25rem`、`--text-2xl` 是 `1.5rem`，即 Tailwind 默认值。16px → 20px
   的接缝是 Kumo 本身就有的，照抄才是忠实复刻。

9. **未验证的部分**：Go 后端不可用，`e2e/auth|generate|history|admin-settings.spec.ts`
   四个 spec 未执行；`/generate`、`/history`、`/account` 三个登录门禁页未做视觉验证。
   已验证的是 4 个公开页（`/`、`/login`、`/register`、`/pricing`）× 明暗 × 1440/375
   共 16 个组合，零 console 错误、主题全部正确应用。后端可用后应补跑。

### 验证结果

`npm run lint` 干净；`npx vitest run` 62/62；`npm run test:theme` 5/5；`npm run build` 成功。

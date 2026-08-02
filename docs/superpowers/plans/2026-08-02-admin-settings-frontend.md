# 后台设置页 · 前端实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans。步骤用 `- [ ]` 勾选。

**Goal:** 管理员能在 `/admin/settings` 改上游 key、R2 五项、前端跳转地址，保存即生效。

**Architecture:** 沿用既有 BFF——页面首屏由 RSC 直连 Go，保存走同源的 `app/api/admin/settings`（**PATCH 是写操作，必须过 CSRF 同源守卫**）。这是本仓库第一个 admin 页面，`app/[locale]/admin/` 目录此前不存在。

**Tech Stack:** Next 16（Proxy 而非 Middleware）/ React 19 / next-intl / Tailwind v4 / shadcn v4（基于 `@base-ui/react`，**无 `asChild`**）。现有 UI 原语只有 `button` / `card` / `input` / `label`，够用，不要为此引入新依赖。

**前置：** 后端已完成并合并（`image-backend` HEAD `4308d53`）。接口契约：

```
GET  /api/v1/admin/settings   → 200 {"settings":{...},"storageEnabled":bool}
PATCH /api/v1/admin/settings  → 200 同上 / 400 {"code":40000,"message":"..."}
两者都要求 JWT + admin 角色；非管理员 403
```

非 secret 项形如 `{"value":"https://x"}`；secret 项形如 `{"configured":true,"masked":"••••••••cd12"}`——**后端永不回传 secret 明文**。

---

## ⚠️ 本轮最重要的一个陷阱

**后端把 secret 的空字符串理解为「清空」，而不是「不改」。**

所以如果表单老老实实把所有字段都提交上去，那么每次保存都会**把三个 secret 全部清空**——而页面上它们本来就显示为掩码、输入框是空的。运营改一个桶名，顺手保存，上游 key 和 R2 密钥就全没了，图片立刻不再转存，而界面看起来一切正常。

**规则：secret 输入框为空 ⇒ 请求体里根本不带这个 key。** 只有用户真的输入了内容才提交。这必须有一条单测和一条 e2e 同时守着——它是那种「写的时候觉得显然、三个月后被人顺手重构掉」的逻辑。

清空 secret 需要一个**显式的动作**（一个「清除」按钮或勾选框），不能靠留空表达。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `lib/admin-types.ts`（新） | `AdminSettings` / `SettingField` 类型 |
| `lib/backend.ts`（改） | `fetchAdminSettings` / `patchAdminSettings` |
| `tests/admin-settings.test.ts`（新） | 客户端映射 + **空 secret 不提交**的守卫 |
| `app/api/admin/settings/route.ts`（新） | GET（只读）+ PATCH（**过 CSRF**） |
| `app/[locale]/admin/settings/page.tsx`（新） | RSC 首屏 + 管理员校验 |
| `components/settings-form.tsx`（新） | 表单与提交逻辑 |
| `messages/{en,zh,ja,ko}.json`（改） | `AdminSettings` 命名空间 |
| `proxy.ts`（改） | `PROTECTED` 加 `admin` |
| `components/site-header.tsx`（改） | 仅管理员可见的入口 |
| `e2e/admin-settings.spec.ts`（新） | 含 375×667 与清空守卫 |

---

## Task 1：类型与客户端

**Files:** Create `lib/admin-types.ts`, `tests/admin-settings.test.ts`；Modify `lib/backend.ts`

- [ ] **Step 1：先写失败的测试**

Create `tests/admin-settings.test.ts`。用与 `tests/backend.test.ts` 相同的 `mockFetch` 手法（复制那个 helper 或从该文件导出复用，二者择一并说明）。至少覆盖：

1. `fetchAdminSettings(token)` 成功时返回 `{settings, storageEnabled}`，带 `Authorization: Bearer`
2. 403 时透出（非管理员）
3. `patchAdminSettings(token, {r2Bucket: "x"})` 只把传入的 key 放进请求体
4. **`patchAdminSettings` 不会自己塞入任何未传的 key**——断言请求体的 key 集合与入参完全一致
5. 400 时透出后端的 `code`/`message`（校验失败）
6. 后端不可达 → `ERR_UNREACHABLE`

- [ ] **Step 2：跑测试确认失败** — `npm test -- tests/admin-settings.test.ts`。

- [ ] **Step 3：写类型** — Create `lib/admin-types.ts`：

```ts
/**
 * 后台设置项。与后端 `internal/handler/admin_settings.go` 的输出一一对应。
 *
 * 判别联合而不是「`value` 与 `masked` 都可选」：后端对非 secret 项只给 `value`、
 * 对 secret 项只给 `configured` + `masked`，**永不回传 secret 明文**。用可选字段
 * 表达会让消费方写出 `field.value ?? field.masked` 这种把两种语义混在一起的代码，
 * 而那正是让明文有机会被显示出来的第一步。
 */
export type SettingField =
  | { kind: "plain"; value: string }
  | { kind: "secret"; configured: boolean; masked: string };

export type AdminSettings = {
  fields: Record<string, SettingField>;
  storageEnabled: boolean;
};

/** 哪些 key 是 secret。与后端 `settings.Specs` 的 `Secret` 标记保持一致。 */
export const SECRET_KEYS = ["fluxApiKey", "r2AccessKeyId", "r2SecretAccessKey"] as const;

/** 页面上的展示顺序。与后端白名单同集合，但顺序由前端决定。 */
export const SETTING_KEYS = [
  "ezlinkaiBaseUrl",
  "fluxApiKey",
  "r2Endpoint",
  "r2AccessKeyId",
  "r2SecretAccessKey",
  "r2Bucket",
  "r2PublicBaseUrl",
  "appBaseUrl",
] as const;
```

- [ ] **Step 4：实现客户端** — 在 `lib/backend.ts` 追加 `fetchAdminSettings` 与 `patchAdminSettings`。后者的 body 就是调用方传入的对象**原样序列化**，不做任何补全。把后端的 `{"value":...}` / `{"configured":...,"masked":...}` 归一成 `SettingField` 判别联合。

- [ ] **Step 5：跑测试确认通过** — `npm test && npx tsc --noEmit && npm run lint`。

- [ ] **Step 6：提交**

```bash
git add lib/admin-types.ts lib/backend.ts tests/admin-settings.test.ts
git commit -m "feat: 后台设置的类型与客户端"
```

---

## Task 2：BFF 路由

**Files:** Create `app/api/admin/settings/route.ts`

- [ ] **Step 1：先读既有两个路由** — `app/api/credits/route.ts`（只读 GET，不过 CSRF）与 `app/api/generations/route.ts` 的 `POST`（写操作，过 `checkSameOrigin`）。本文件两种都要。

- [ ] **Step 2：实现**

- `GET`：`getToken()` → 无 token 401 → `fetchAdminSettings` → `toClientError` 兜错。只读，**不过** CSRF。
- `PATCH`：**必须过 `checkSameOrigin`**。这是写操作，而且写的是上游凭据——`lib/bff.ts` 里那段注释说明了为什么 `SameSite=lax` 不够：`req.json()` 忽略 Content-Type，跨站 `<form enctype="text/plain">` 能发出合法 JSON。一个能被 CSRF 打的设置接口意味着攻击者可以把受害者的 R2 换成自己的桶。
- `PATCH` 的 body 原样转发，不补字段（见开头那个陷阱）。

- [ ] **Step 3：验证** — `npx tsc --noEmit && npm run lint && npm test` 全绿。

- [ ] **Step 4：提交**

```bash
git add app/api/admin/settings/route.ts
git commit -m "feat: BFF 的后台设置路由，PATCH 过同源守卫"
```

---

## Task 3：页面、表单与四语

**Files:** Create `app/[locale]/admin/settings/page.tsx`, `components/settings-form.tsx`；Modify `messages/*.json` ×4, `proxy.ts`, `components/site-header.tsx`

- [ ] **Step 1：四语文案**

给四个文件各加一个 `AdminSettings` 命名空间，键至少含：`title`、`subtitle`、`save`、`saving`、`saved`、`saveFailed`、`configured`、`notConfigured`、`secretPlaceholder`（如「留空表示不修改」）、`clearSecret`、`clearConfirm`、`storageOn`、`storageOff`、`forbidden`，以及八个字段各自的 label 与 help。`Metadata.adminSettingsTitle` 与 `Nav.admin` 也要加。

**`secretPlaceholder` 的文案必须明确说「留空 = 不修改」**，因为那正是这个表单唯一反直觉的地方。

跑 Task 3 Step 2 的脚本确认四个文件 key 集合完全一致。

- [ ] **Step 2：确认四语 key 一致**

```bash
node -e "const l=['en','zh','ja','ko'].map(x=>[x,require('./messages/'+x+'.json')]);const f=o=>{const r=[];const w=(p,v)=>{for(const k in v){const q=p?p+'.'+k:k;typeof v[k]==='object'?w(q,v[k]):r.push(q)}};w('',o);return r.sort()};const b=f(l[0][1]);for(const [n,o] of l){const k=f(o);if(JSON.stringify(k)!==JSON.stringify(b)){console.log(n,'不一致');console.log('缺:',b.filter(x=>!k.includes(x)));console.log('多:',k.filter(x=>!b.includes(x)))}}console.log('共',b.length,'个 key')"
```

- [ ] **Step 3：写表单组件** — Create `components/settings-form.tsx`（`"use client"`）。要点：

- 非 secret 字段：普通受控 input，初值来自 `field.value`
- secret 字段：input 初值**永远是空串**，placeholder 用 `secretPlaceholder`，旁边显示 `configured ? masked : notConfigured`
- **提交时只收集「与初值不同的非 secret 字段」+「用户真的输入了内容的 secret 字段」**。空的 secret 一律不进 body。在代码里用注释写明理由。
- 清空 secret 走独立的「清除」按钮，点击后需二次确认（`clearConfirm`），确认后才发 `{key: ""}`
- 保存失败时显示后端 `message`——**这里是例外**：设置页的使用者是管理员，后端那些校验文案（「那是 S3 API 域名，不允许匿名读」）正是他需要看到的原文。其他页面刻意不显示后端原文，此处刻意显示，注释里说明这个差异。

- [ ] **Step 4：写页面** — Create `app/[locale]/admin/settings/page.tsx`。**先读 `app/[locale]/account/page.tsx`** 照它的形状写（`params` 是 Promise、`getToken()`、401 处理）。

额外要点：**必须校验管理员角色**。`proxy.ts` 只检查 cookie 存在，非管理员登录后完全可以访问 `/admin/settings` 的 URL。页面要 `fetchMe(token)` 拿 `role`，非 `admin` 就渲染 `forbidden` 文案（或 `notFound()`），**不要**渲染表单——否则普通用户能看到掩码与配置状态，那是信息泄露。

- [ ] **Step 5：守卫与入口**

- `proxy.ts` 的 `PROTECTED` 加 `admin`
- `components/site-header.tsx` 加入口，但**仅管理员可见**（顶栏已经在读 `/me`，用它的 `role` 判断）

- [ ] **Step 6：验证** — `npx tsc --noEmit && npm run lint && npm test && npm run build`，构建输出里要有 `/[locale]/admin/settings`。

- [ ] **Step 7：提交**

```bash
git add "app/[locale]/admin" components/settings-form.tsx messages proxy.ts components/site-header.tsx
git commit -m "feat: /admin/settings 页面与四语文案，仅管理员可见"
```

---

## Task 4：端到端覆盖（含 375×667）

**Files:** Create `e2e/admin-settings.spec.ts`；可能 Modify `e2e/accounts.ts`

后端须以真实 `CONFIG_ENCRYPTION_KEY` 启动。`e2e/accounts.ts` 已有 `signUp`；管理员账号靠 `BOOTSTRAP_ADMIN_EMAIL` 决定，`e2e/backend.ts` 里已有 `ADMIN_EMAIL` / `ensureAdminToken`——**先读那个文件**，看能否直接复用它登录管理员，不要另造一套。

- [ ] **Step 1：写用例**，至少覆盖：

1. **普通用户访问 `/admin/settings` 看不到表单**（渲染 forbidden，且页面里不出现任何掩码或字段 label）
2. 未登录访问 → 跳登录
3. 管理员能看到八个字段；secret 字段显示「已配置/未配置」而**不是**明文
4. 改 `r2Bucket` 并保存 → 成功提示 → 刷新后新值仍在
5. **【关键】只改 `r2Bucket` 保存后，secret 仍然是「已配置」**——这条守的就是开头那个陷阱。若表单错误地提交了空 secret，这里会红。
6. 把 `r2PublicBaseUrl` 填成 S3 API 域名 → 保存失败并显示后端原文里的关键词
7. `test.describe("移动端（375×667）")`：表单在窄屏下可用、无横向溢出

- [ ] **Step 2：跑用例** — `npx playwright test e2e/admin-settings.spec.ts --reporter=line`。

- [ ] **Step 3：实机截图确认（375×667）— 不可跳过**

在移动端用例末尾临时加 `await page.screenshot({ path: "admin-375.png", fullPage: true })`，跑完**用 Read 工具打开图片人眼看**：八个字段是否都够宽可填、label 有没有被截断、secret 的「已配置」标记与输入框有没有挤在一起、保存按钮是否可达。确认后删掉截图代码与 png。

- [ ] **Step 4：全量 e2e 并提交**

```bash
npx playwright test --reporter=line   # 期望 18 既有 + 新增全绿
git add e2e/admin-settings.spec.ts
git commit -m "test: 后台设置页端到端覆盖，含空 secret 不被清空的守卫与 375×667"
```

---

## 完成检查

- [ ] `npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build` 全绿
- [ ] `npm run test:e2e` 全绿
- [ ] 四语 key 集合一致
- [ ] 375×667 实机截图人眼确认过
- [ ] 手工：四种语言各打开一次 `/admin/settings`，确认无英文漏网文案
- [ ] 手工：用普通账号访问 `/admin/settings`，确认看不到任何字段或掩码
- [ ] 手工：只改一个非 secret 字段保存，然后确认三个 secret 仍是「已配置」

## 已知遗留

- ja/ko 译文未经母语审校。
- 没有配置变更审计（谁改了什么无从追溯），与后端设计一致。
- Stripe 的两个 secret 不在此页——它们刻意留在环境变量（后端设计文档 §3）。页面上应当有一句说明，免得管理员在这里找不到而以为坏了。

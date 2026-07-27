# image-front

AI 图像生成订阅平台前端（Next.js 16 + Tailwind v4 + shadcn/ui）。

设计文档：`../image-backend/docs/superpowers/specs/2026-07-27-image-platform-design.md`
实施计划：`docs/superpowers/plans/2026-07-27-m1-frontend-auth.md`

## 本地运行

需要先启动后端（另一个仓库 [image-backend](https://github.com/ye4293/image-backend)）：

```bash
cd ../image-backend
PORT=8080 JWT_SECRET=dev-secret-change-me go run ./cmd/server
```

不配 `DATABASE_URL` 时后端自动用临时 SQLite，无需 Docker。

再启动前端：

```bash
cp .env.example .env.local   # BACKEND_URL 指向后端
npm install
npm run dev                  # http://localhost:3000
```

## 架构：BFF（Backend-For-Frontend）

浏览器**只**与 Next.js 同源通信；`app/api/auth/*` 的 Route Handler 在服务端转发到 Go 后端。
这样做的三个原因：

1. Go 后端没有 CORS 中间件，浏览器直连会被拦——BFF 让我们不必为了前端改后端；
2. JWT 存 **httpOnly cookie**（`image_token`，7 天，与后端 JWT 有效期一致），JS 读不到，
   避免 XSS 窃取（localStorage 方案做不到）；
3. `/account` 是 Server Component，服务端带 cookie 调 `/me`，首屏无加载闪烁。

### 模块职责

| 模块 | 职责 |
|---|---|
| `lib/backend.ts` | **唯一**知道 Go 后端 URL 与响应格式的模块。无 `next/*` 依赖，可在纯 Node 下单测 |
| `lib/bff.ts` | Route Handler 共用：同源守卫、凭据解析、错误响应映射。同样无 `next/*` 依赖 |
| `lib/session.ts` | **唯一**知道 cookie 属性的模块 |
| `lib/cookie-name.ts` | 只放 cookie 名常量，无依赖——供 Edge 运行时的 `proxy.ts` 引用 |
| `proxy.ts` | Next 16 的 Middleware（已改名 Proxy）。**组合**了 next-intl 的语言路由与认证守卫 |
| `i18n/routing.ts` | 语言列表、`localePrefix` 策略、语言自称。无 React 依赖，可从 Edge 引用 |
| `i18n/request.ts` | 每请求解析语言 + 加载 `messages/<locale>.json`（由 next-intl 插件接入） |
| `i18n/navigation.ts` | 语言感知的 `Link` / `useRouter` / `redirect`——**页面里不要直接用 `next/link`** |

`lib/session.ts` **刻意不导出** `TOKEN_COOKIE`：`proxy.ts` 跑在 Edge 运行时，不能 import
`next/headers`。常量单独成文件，就没有任何途径能把 `next/headers` 拖进 Edge bundle。

### 安全约定

**所有 cookie 认证的 POST 端点都必须过 `lib/bff.ts` 的同源守卫。** 不能依赖"请求体是 JSON
所以会触发 CORS 预检"——`req.json()` 按 Fetch 规范根本不看 `Content-Type`，跨站表单用
`enctype="text/plain"` 可以构造出合法 JSON，从而在受害者浏览器上种下攻击者账号的 session
（登录 CSRF / 会话固定）。`SameSite=lax` 挡不住，它管 cookie 的**发送**不管**设置**。
详见计划文档的 CSRF 一节。

判定顺序：`Sec-Fetch-Site` 存在且非 `same-origin` → 403；否则 `Origin` 存在且 host 不符
→ 403；否则放行。第三条是故意的——两个头都没有的请求不是浏览器发起的，不构成 CSRF 向量，
而拒绝它会打断 curl 与服务端到服务端调用。

## 页面（M1）

| 路由 | 说明 |
|---|---|
| `/` | 落地页 |
| `/register` | 邮箱注册 |
| `/login` | 邮箱登录 |
| `/account` | 当前用户信息 + 登出 |

## 国际化（en / zh / ja / ko）

用 next-intl v4。**所有用户可见文案都在 `messages/*.json` 里**，组件里不写字面量
（代码注释仍然写中文，那是给维护者的）。

- 默认语言 `en` 走**裸路径**（`/login`、`/generate`），其余语言带前缀（`/zh/login`）：
  `localePrefix: "as-needed"`。**不要改成 `always`**——Playwright 套件与 `proxy.ts`
  的 matcher 都按裸路径写，改了全线失败，而产品上没有收益。
- 页面全部在 `app/[locale]/` 下；`app/api/*` **不在**语言段内，也被 proxy 的 matcher
  排除，否则会被 rewrite 成 `/en/api/...` 直接 404。
- 首次访问按 `Accept-Language` 检测，之后记在 `NEXT_LOCALE` cookie 里（next-intl 自带，
  不要自己实现）。
- `<html lang>` 跟随实际语言（在 `app/[locale]/layout.tsx`）。硬编码 `lang="en"` 对
  四种语言里的三种都是错的：读屏会用英语语音念中日韩文本。
- 带数量的文案用 ICU 插值 / 复数（`{count, plural, ...}`），**不要用字符串拼接**——
  英文的单复数与中日韩的量词位置对不上。
- 语言切换器在 `components/language-switcher.tsx`，原生 `<select>`，理由同
  `model-selector.tsx`。

新增文案的流程：往 `messages/en.json` 加键 → 同步补齐 zh/ja/ko → 组件里 `t("key")`。
漏译时 next-intl 在 dev 下会报 `MISSING_MESSAGE`，不会静默回退。

## 开发命令

```bash
npm run build       # 提交前必跑
npm test            # Vitest 单元测试（64 个）
npm run test:e2e    # Playwright 端到端（4 条，需后端在跑）
npm run lint
```

## 技术栈的两个坑（都与训练数据不符，改前先读）

- **Next 16 把 Middleware 改名为 Proxy**：根目录文件是 `proxy.ts`，导出函数叫 `proxy`。
  `cookies()` 与页面的 `searchParams` 都是 async，必须 `await`。遇到与记忆不符的 API，
  查 `node_modules/next/dist/docs/`。
- **shadcn v4 底层换成了 `@base-ui/react`，没有 `asChild`**。但也**不要**用
  `<Button nativeButton={false} render={<Link/>}>` 做导航链接——Base UI 会强制写上
  `role="button"`，渲染成 `<a role="button">`，会跳页的链接被播报成按钮。正确做法是
  `<Link className={buttonVariants({ variant: "ghost" })}>`，只取样式、保留 `role=link`
  语义。`e2e/auth.spec.ts` 里有一条断言守着这点。

## M1 未覆盖 / 已知缺口

- **登录接口没有速率限制**（前后端都没有）。上线前必须补。
- Google / GitHub OAuth 登录、邮箱验证、忘记密码。
- `/pricing`、`/generate`、`/history`、`/gallery`、`/admin/*`。
- 已登录用户访问 `/login`、`/register` 不会被重定向走。
- `proxy.ts` 的重定向不带 return-URL（加 `?next=` 需要配开放重定向白名单，目前受保护路由
  只有 `/account`，先不做）。
- 顶栏在根布局里读 cookie，**导致所有路由都变成动态渲染**，`/` 和 `/register` 无法预渲染
  或走 CDN 缓存。M1 可接受；等落地页对 SEO/TTFB 重要时，用 `<Suspense>` 包住依赖登录态的
  那一小块，或上 PPR。
- **后端错误文案不随界面语言变。** `email already registered`、`invalid email or password`
  这类 message 由 Go 后端原样返回、前端原样显示，中日韩界面下也是英文。**不要在前端做
  字符串匹配翻译**——那会把前端文案与后端措辞绑死，后端改一个词就静默退化。正解是后端
  返回稳定的错误码，前端按码查词条。见 `components/auth-form.tsx` 与
  `components/generate/workbench.tsx` 里的注释。
- **套餐文案（`plans.name` / `tagline` / `features`）没有本地化**，因为它是数据不是界面
  文案，将来直接来自后端 `plans` 表。需要后端加按语言的列或 `plan_translations` 表。
  见 `lib/fixtures.ts` 里 `PLANS` 上方的注释。
- **ja / ko 词条尚未经母语者审校**（zh/en 由维护者直接写）。上线前必须过一轮 review。

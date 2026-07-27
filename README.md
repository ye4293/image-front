# image-front

AI 图像生成订阅平台前端（Next.js 16 + Tailwind v4 + shadcn/ui）。

设计文档：`../image-backend/docs/superpowers/specs/2026-07-27-image-platform-design.md`
（本轮补充：`docs/superpowers/specs/2026-07-27-m2-frontend-workbench-pricing-design.md`）
实施计划：`docs/superpowers/plans/2026-07-27-m1-frontend-auth.md`、
`docs/superpowers/plans/2026-07-27-m2-frontend-workbench-pricing.md`

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
| `lib/generation-types.ts` | 生成/套餐相关的类型。**这是前后端的契约**，接真后端时不动 |
| `lib/fixtures.ts` | 本轮的假数据与进程级内存余额。**接真后端时整体删除**，见下面「假数据说明」 |

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

#### 假数据接口目前**完全没有鉴权**（接后端前必须补）

`proxy.ts` 的 matcher 从头到尾不匹配 `/api/*`（必须排除，否则 BFF 路由会被 rewrite 成
`/en/api/...` 直接 404），而 `app/api/{models,plans,credits,generations}` 这四个假数据
Handler 自己也不看 cookie。所以**不带任何 cookie 的 `curl` 就能读余额、能花掉次数**。
同源守卫挡的是 CSRF，不是未认证访问，两回事。

本轮刻意不修：余额是一个进程级全局整数对，没有"授权给谁"这回事，给共享计数器加鉴权是
安全表演。但**这个形状若活到真后端就是直接的未授权扣费漏洞**，三条必须一起做：

1. `POST /generations` 必须在 `planSpend` **之前**解析调用者身份；
2. 余额必须按 `credit_accounts.user_id` 隔离，不能是全局计数器；
3. 鉴权检查必须放在等上游的**之前**——否则 `slow` 那条挂住连接 90 秒的路径就成了
   无需认证的 DoS。

**本里程碑的端到端测试结构上发现不了这个缺失**：每条用例都先注册登录，"未认证也能调用"
这条路径没有任何测试经过。补鉴权时要专门加一条不带 cookie 的断言，别指望现有套件会变红。

## 页面

「数据」一列区分该页面的内容来自**真实后端**还是**本地假数据**。这一列是给下一个人
用来判断"改这里要不要动 Go 后端"的：标着假数据的页面，界面已经定型，缺的只是数据源。

| 路由 | 说明 | 数据 |
|---|---|---|
| `/` | 落地页 | 真实（无数据依赖） |
| `/register` | 邮箱注册 | 真实（Go 后端） |
| `/login` | 邮箱登录 | 真实（Go 后端） |
| `/account` | 当前用户信息 + 登出 | 真实（Go 后端 `/me`） |
| `/generate` | 生成工作台 | **假数据**（模型列表、余额、生成结果全是本地的） |
| `/pricing` | 定价与加量包 | **假数据**，且套餐/加量包按钮未接 Stripe（`disabled`） |

### 假数据说明

`app/api/{models,plans,credits,generations}` 四个 Route Handler 返回写死的内容，可变状态
（就是那对余额整数）活在 `lib/fixtures.ts` 的模块级变量里——**它是进程级的、所有用户共用
的一对整数，dev server 一重启就回到初始值 12 + 3**。所以本地"余额怎么自己变回去了"不是
bug，是重启。

生成结果由 prompt 关键词**确定性**触发，不用随机——随机的失败路径没法稳定复现，也没法
写自动化测试。匹配是**子串、不区分大小写**，优先级 `fail > slow > quick > 默认`：

| prompt 含 | 行为 |
|---|---|
| `fail` | 8 秒后失败，按扣费时的拆分退回次数 |
| `slow` | 90 秒后成功（用来手工看等待态） |
| `quick` | 1 秒后成功（端到端测试用，套件才跑得快） |
| 其他 | 15 秒后成功 |

代价是 "a failing bridge at sunset" 会秒失败——撞上时那是设计，不是 bug。

**接入真实后端时，只改这四个 Handler 的内部实现并删掉 `lib/fixtures.ts`；组件、
`lib/generation-types.ts` 里的类型、以及端到端测试都不动。** 这正是当初选 Route Handler
而不是 MSW、也不是在组件里直接 import 假数据的原因（设计文档 §2.3）：契约边界就落在 HTTP
上，替换数据源不会波及界面。

### 生成是同步的，以及这依赖的两个前提

`POST /api/generations` **同步返回成品**，没有轮询、没有任务 id。这不是偷懒：上游对图像
生成直接同步返回 URL，最慢约 3 分钟；为一个本来就同步的上游套一层任务队列，等于凭空引入
"任务状态存哪、谁来轮询、轮询多久算超时"三个问题（设计文档 §2.1）。

但同步方案**依赖两个部署前提，任一变化就必须改成 SSE 流式 + 心跳**：

1. **域名不能走 Cloudflare 的橙云代理。** CF 的 100 秒源站响应超时（524）在 Enterprise
   以下**不可配置**，一挂就是所有耗时超过 100 秒的生成全部失败。要用 CF 只能是灰云
   （仅 DNS）。
2. **不能部署到 Vercel Hobby。** Route Handler 有 60 秒上限。

这两条都不会在本地暴露——dev server 没有任何超时，一切正常；上线接了 CF 才开始"大图必挂、
小图正常"，症状看起来像模型问题。

接后端时还有三件必须做的事，漏掉任何一件都是用户可见的资损：

- **调用上游要用脱离请求生命周期的 context。** 若把 HTTP 请求的 context 直接传下去，用户
  一关页面就取消上游调用——次数已经扣了，图没了。`app/api/generations/route.ts` 里的
  `sleep` **刻意不理 `req.signal`** 就是在把这个正确行为固化成 mock，不要"修好"它。
  连带结论：客户端超时的提示文案不能说"次数未被扣除"，因为确实扣了。
- **先落 `generations` 行再调上游**，否则进程在等待期间挂掉就查无此事。
- **启动时扫一遍卡在 `processing` 的行**兜底退款，否则一次重启就永久吞掉那些次数。

`/history` 的优先级因此上升——它是关掉页面后找回图片的唯一途径，也是客户端超时后用户唯一
能确认"这次到底扣没扣、图去哪了"的地方。

### 每个模型一个后端 adapter，前端契约保持统一

ezlinkai 上 Flux / xAI / image-2 / nano-banana 的请求参数、响应格式、乃至 endpoint 路径
都不一样。**这些差异必须全部关在 Go 后端的 per-provider adapter 层里，不得渗入前端**：一旦
前端知道"xAI 要传 seed、nano 要传 aspect_ratio 字符串、flux 要传 width/height"，每加一个
模型就要改 UI，模型配置也会散落在前后端两处。后端的 `models` 表需要加 `provider` 列。

因此前端只认一个契约，无论选哪个模型：`{ prompt, model, aspectRatio, isPublic }` 进，
`Generation` 出。恰恰因为上游会变，这个契约才更要现在就定死。

`app/api/generations/route.ts` 是**占位实现，不构成契约承诺**——接真后端时整体重写。
详见设计文档 §2.4。

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
npm run test:e2e    # Playwright 端到端（10 条，需后端在跑）
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

## 已知缺口（M1 + M2 未覆盖）

- **登录接口没有速率限制**（前后端都没有）。上线前必须补。
- Google / GitHub OAuth 登录、邮箱验证、忘记密码。
- `/history`、`/gallery`、`/admin/*`。其中 `/history` 因同步生成而优先级最高，理由见
  上面「生成是同步的」一节。
- **Stripe 未接入**：定价页的套餐与加量包按钮全是 `disabled`，title 写着
  `Stripe isn't connected yet`。订阅、加量包支付、webhook 全部待做。
- **参考图上传是假的**：R2 未接入，`param-panel.tsx` 只取文件名做本地预览，用来验证布局，
  文件根本没上传，也不会进请求体。
- **prompt 长度上限只有客户端提示**：`<textarea maxLength={2000}>` 挡不住 `curl`，Route
  Handler 也没有 body 大小上限。接后端时要在服务端校验长度并返回 `40000`。
- 假数据接口没有鉴权，见上面「安全约定」一节。
- 已登录用户访问 `/login`、`/register` 不会被重定向走。
- `proxy.ts` 的重定向不带 return-URL（加 `?next=` 需要配开放重定向白名单，目前受保护路由
  只有 `/account` 与 `/generate`，先不做）。
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

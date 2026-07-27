# M1 前端骨架与认证 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `image-front` 建立 Next.js 前端骨架，实现落地页、注册、登录、账户页，跑通与 `image-backend` M1 三个接口（register / login / me）的端到端认证闭环。

**Architecture:** 采用 **BFF（Backend-For-Frontend）** 模式——浏览器只与 Next.js 同源通信，Next.js 的 Route Handler 在服务端转发到 Go 后端。这样做的三个原因：(1) Go 后端目前没有 CORS 中间件，浏览器直连会被拦，BFF 让我们不必为了前端改后端；(2) JWT 存 **httpOnly cookie**，JS 读不到，避免 XSS 窃取 token（localStorage 方案做不到）；(3) `/account` 作为 Server Component 在服务端带 cookie 调 `/me`，首屏无加载闪烁。`proxy.ts` 只做 cookie 存在性检查（快速拦截），真正的 token 有效性由后端 `/me` 返回 401 时重定向兜底。

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui + Vitest（单元测试）+ Playwright（端到端）。包管理器用 **npm**（本机已有 npm 10.9.3，参考项目的 pnpm 未安装）。

> **Next.js 16 注意事项**（Task 1 实际装到 16.2.12，本计划已按 16 校准）：
> - **Middleware 改名为 Proxy**：根目录文件是 `proxy.ts`，不再是 `middleware.ts`，导出的函数名为 `proxy`。功能完全一致。（`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`）
> - `cookies()` 仍是 **async**，必须 `await`。
> - 页面的 `searchParams` 仍是 **Promise**，必须 `await`。
> - Turbopack 是默认，`dev` 脚本无需 `--turbopack` 标志。
> - 遇到任何与记忆不符的 API，查 `node_modules/next/dist/docs/` 而不是凭印象写。

> **shadcn/ui v4 注意事项**（Task 2 实际装到 shadcn CLI v4.15.0）：
> - 底层原语从 Radix UI 换成了 **`@base-ui/react`**，**没有 `asChild`**。
> - 用链接当按钮的正确写法是 `render` prop + `nativeButton={false}`：
>   ```tsx
>   <Button variant="ghost" nativeButton={false} render={<Link href="/login" />}>Sign in</Button>
>   ```
>   `render` 接受一个 ReactElement，Base UI 把自己的 props 合并进去；`nativeButton={false}` 告诉它渲染出来的不是原生 `<button>`（这里是 `<a>`），必须显式声明，否则无障碍属性会错。
> - 渲染结果是 `<a>`，所以 Playwright 里它的 role 是 `link` 而不是 `button`——Task 9 的断言按此编写。
> - `Button` 同时导出 `buttonVariants`，需要纯样式时可以 `className={buttonVariants({ variant: "outline" })}`。

**前置条件：** 实现期间 Go 后端需在 `localhost:8080` 运行。启动方式（在 `~/Desktop/image-backend`）：

```bash
PORT=8080 JWT_SECRET=dev-secret-change-me go run ./cmd/server
```

不配 `DATABASE_URL` 时后端自动用临时 SQLite，无需 Docker。

---

## 后端接口契约（已实现，不要改动后端）

| 方法 | 路径 | 请求体 | 成功 | 失败 |
|---|---|---|---|---|
| GET | `/api/v1/health` | — | 200 `{"status":"ok"}` | — |
| POST | `/api/v1/auth/register` | `{email, password}` password 8~72 位 | 201 `{"id":1,"email":"a@b.com"}` | 400 `{"code":40000,...}` / 409 `{"code":40901,"message":"email already registered"}` |
| POST | `/api/v1/auth/login` | `{email, password}` | 200 `{"token":"eyJ..."}` | 401 `{"code":40101,"message":"invalid email or password"}` |
| GET | `/api/v1/me` | Header `Authorization: Bearer <token>` | 200 `{"id":1,"email":"a@b.com","role":"user"}` | 401 `{"code":40100,"message":"missing token"｜"invalid token"}` |

错误响应统一为 `{code:number, message:string}`。JWT 有效期 7 天（后端 `internal/auth/jwt.go`），所以 cookie 的 `maxAge` 也设 7 天。

---

## CSRF：所有 cookie 认证的 POST 端点都必须过同源校验

**这一节是 Task 5 代码审查后补写的——初版计划漏了 CSRF，导致实现出过一个真实漏洞。后续每新增一个 Route Handler 都要遵守。**

不能依赖"请求体是 JSON 所以会触发 CORS 预检"这个假设——**它是错的**。`req.json()` 按 Fetch 规范根本不看 `Content-Type` 头，而跨站表单用 `enctype="text/plain"` 属于 CORS 简单请求（无预检），其 `name=value\r\n` 编码可以构造出合法 JSON：

```html
<form method="POST" enctype="text/plain" action="https://app.example/api/auth/login">
  <input name='{"email":"attacker@evil.com","password":"pw","x":"' value='"}'>
</form>
```

请求体到达服务端是 `{"email":"attacker@evil.com","password":"pw","x":"="}`，解析成功，于是路由给受害者浏览器种上了**攻击者账号**的 session cookie（登录 CSRF / 会话固定）。受害者之后的上传、生成、账单全落进攻击者能读的账号里。

`sameSite: "lax"` 挡不住：它管 cookie 的**发送**，不管**设置**，而这个攻击不需要任何已存在的 cookie。

**约定：所有 Route Handler 一律通过 `lib/bff.ts` 的守卫读取请求**，判定顺序如下（顺序有讲究）：

1. `Sec-Fetch-Site` 头存在且值不是 `same-origin` → 403。（现代浏览器都发这个头，页面 JS 无法伪造。）
2. 否则 `Origin` 头存在且 host 与请求自身 host 不符 → 403。
3. 否则放行。

第 3 条是**故意**的：两个头都没有的请求不是浏览器发起的，因此不构成 CSRF 向量；而拒绝它会打断本计划自己的 `curl` 验证步骤和未来的服务端到服务端调用。**不要**把它"加固"成默认拒绝——那只挡住 curl，挡不住攻击者，是虚假的安全感。

---

## File Structure

```
image-front/
├── app/
│   ├── layout.tsx                    根布局：字体、全局样式、顶栏
│   ├── globals.css                   Tailwind v4 入口 + 主题变量（脚手架生成）
│   ├── page.tsx                      / 落地页（Server Component）
│   ├── login/page.tsx                /login（Server Component 包一层 AuthForm）
│   ├── register/page.tsx             /register
│   ├── account/page.tsx              /account（Server Component，服务端调 /me）
│   └── api/auth/
│       ├── login/route.ts            BFF：转发登录，成功则写 httpOnly cookie
│       ├── register/route.ts         BFF：转发注册（注册后不自动登录，跳登录页）
│       └── logout/route.ts           BFF：清 cookie
├── components/
│   ├── auth-form.tsx                 登录/注册共用的客户端表单（mode 区分）
│   ├── site-header.tsx               顶栏（Server Component，按登录态渲染）
│   └── ui/                           shadcn 生成：button/input/label/card
├── lib/
│   ├── backend.ts                    Go 后端 HTTP 客户端 + Result 类型（纯函数，可测）
│   ├── bff.ts                        Route Handler 共用：同源守卫 + 凭据解析 + 错误响应（纯函数，可测）
│   ├── cookie-name.ts                只放 cookie 名常量，无依赖（供 Edge 运行时的 proxy.ts 引用）
│   └── session.ts                    cookie 读写辅助（唯一知道 cookie 属性的地方）
├── proxy.ts                          /account 无 cookie 直接跳 /login（Next 16 的 Middleware）
├── tests/
│   ├── backend.test.ts               lib/backend.ts 单元测试（Vitest，mock fetch）
│   └── bff.test.ts                   lib/bff.ts 单元测试（同源守卫各分支）
├── e2e/auth.spec.ts                  Playwright 端到端：注册→登录→账户→登出
├── .env.example / .env.local         BACKEND_URL
├── vitest.config.ts
├── playwright.config.ts
└── docs/superpowers/plans/           本计划
```

责任划分要点：`lib/backend.ts` 是唯一知道 Go 后端 URL 和响应格式的地方，全部 Route Handler 都通过它调用；`lib/session.ts` 是唯一知道 cookie 名字和属性的地方；`lib/cookie-name.ts` 只放 cookie 名常量，供 `proxy.ts`（Edge 运行时，不能 import `next/headers`）安全引用。任何组件都不直接 `fetch` 后端。

---

## Task 1: 脚手架与仓库初始化

**Files:**
- Create: 整个 Next.js 骨架（由 `create-next-app` 生成）
- Create: `.env.example`, `.env.local`
- Modify: `.gitignore`（追加 `.env.local`，脚手架通常已含 `.env*`，需确认）

- [x] **Step 1: 在空目录生成 Next.js 项目**

```bash
cd ~/Desktop/image-front
npx --yes create-next-app@latest . --ts --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm --turbopack
```

如果命令因目录非空（已有 `docs/`）而拒绝，改用：先 `mv docs /tmp/if-docs`，跑完脚手架再 `mv /tmp/if-docs docs`。

- [x] **Step 2: 确认能启动**

```bash
npm run dev
```

期望输出包含 `Ready in` 与 `http://localhost:3000`。用另一个终端 `curl -s -o /dev/null -w "%{http_code}" localhost:3000` 期望 `200`。确认后 Ctrl-C 停掉。

- [x] **Step 3: 写环境变量文件**

`.env.example`：

```
# Go 后端地址（仅服务端使用，不加 NEXT_PUBLIC_ 前缀，避免泄露到浏览器）
BACKEND_URL=http://localhost:8080
```

`.env.local`（同内容，本地实际生效，不入库）：

```
BACKEND_URL=http://localhost:8080
```

- [x] **Step 4: 确认 .env.local 被忽略**

```bash
grep -q '^\.env\*' .gitignore || echo '.env.local' >> .gitignore
git check-ignore -v .env.local
```

期望输出一行 `.gitignore:...:.env.local` 或 `.gitignore:...:.env*`（说明已忽略）。

- [x] **Step 5: 首次提交**

```bash
git add -A
git commit -m "chore: 初始化 Next.js 15 + TypeScript + Tailwind 前端骨架"
```

（`create-next-app` 会自动 `git init`；若未初始化则先 `git init -b main`。）

---

## Task 2: shadcn/ui 与测试工具链

**Files:**
- Create: `components.json`, `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/label.tsx`, `components/ui/card.tsx`, `lib/utils.ts`
- Create: `vitest.config.ts`
- Modify: `package.json`（新增 test 脚本）

- [x] **Step 1: 初始化 shadcn/ui**

```bash
npx --yes shadcn@latest init -d -y
```

`-d` 用默认配置（style=new-york, baseColor=neutral, cssVariables=true）。生成 `components.json` 与 `lib/utils.ts`（内含 `cn()`）。

- [x] **Step 2: 添加需要的组件**

```bash
npx --yes shadcn@latest add button input label card -y
```

期望 `components/ui/` 下出现 4 个文件。

- [x] **Step 3: 安装 Vitest**

```bash
npm i -D vitest
```

- [x] **Step 4: 写 vitest 配置**

`vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

`environment: "node"` 即可——本计划的单元测试只测 `lib/backend.ts` 这样的纯 fetch 逻辑，不需要 jsdom。

- [x] **Step 5: 加 test 脚本**

在 `package.json` 的 `scripts` 中加入（保留脚手架已有的 dev/build/start/lint）：

```json
"test": "vitest run"
```

- [x] **Step 6: 验证空跑不报错**

```bash
npm test
```

期望：`No test files found` 之类的提示，退出码非崩溃即可（Vitest 无测试文件时退出码为 1 并提示 "No test files found, exiting with code 1"，这是正常的）。

- [x] **Step 7: 提交**

```bash
git add -A
git commit -m "chore: 接入 shadcn/ui 组件与 Vitest 测试工具链"
```

---

## Task 3: 后端客户端 lib/backend.ts（TDD）

**Files:**
- Create: `lib/backend.ts`
- Test: `tests/backend.test.ts`

- [x] **Step 1: 写失败的测试**

`tests/backend.test.ts`：

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { registerUser, loginUser, fetchMe } from "@/lib/backend";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registerUser", () => {
  it("成功时返回用户 id 与 email", async () => {
    const fn = mockFetch(201, { id: 1, email: "a@b.com" });
    const res = await registerUser({ email: "a@b.com", password: "secret12345" });
    expect(res).toEqual({ ok: true, data: { id: 1, email: "a@b.com" } });
    expect(fn).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/auth/register",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.com", password: "secret12345" }),
      }),
    );
  });

  it("邮箱重复时返回 409 与后端 code", async () => {
    mockFetch(409, { code: 40901, message: "email already registered" });
    const res = await registerUser({ email: "a@b.com", password: "secret12345" });
    expect(res).toEqual({
      ok: false,
      status: 409,
      error: { code: 40901, message: "email already registered" },
    });
  });
});

describe("loginUser", () => {
  it("成功时返回 token", async () => {
    mockFetch(200, { token: "jwt.token.here" });
    const res = await loginUser({ email: "a@b.com", password: "secret12345" });
    expect(res).toEqual({ ok: true, data: { token: "jwt.token.here" } });
  });

  it("密码错误时返回 401", async () => {
    mockFetch(401, { code: 40101, message: "invalid email or password" });
    const res = await loginUser({ email: "a@b.com", password: "wrong" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(40101);
  });
});

describe("fetchMe", () => {
  it("带上 Bearer token 并返回用户", async () => {
    const fn = mockFetch(200, { id: 1, email: "a@b.com", role: "user" });
    const res = await fetchMe("jwt.token.here");
    expect(res).toEqual({ ok: true, data: { id: 1, email: "a@b.com", role: "user" } });
    expect(fn).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/me",
      expect.objectContaining({
        headers: { authorization: "Bearer jwt.token.here" },
        cache: "no-store",
      }),
    );
  });

  it("token 失效时返回 401", async () => {
    mockFetch(401, { code: 40100, message: "invalid token" });
    const res = await fetchMe("bad");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });
});

describe("非 JSON 响应", () => {
  it("后端挂了返回 502 兜底错误", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    const res = await loginUser({ email: "a@b.com", password: "x" });
    expect(res).toEqual({
      ok: false,
      status: 502,
      error: { code: 50200, message: "backend unreachable" },
    });
  });
});
```

- [x] **Step 2: 运行测试确认失败**

```bash
BACKEND_URL=http://localhost:8080 npm test
```

期望：FAIL，报 `Failed to resolve import "@/lib/backend"`。

- [x] **Step 3: 实现 lib/backend.ts**

```ts
export type BackendError = { code: number; message: string };

/**
 * 本模块自己合成的错误码（后端不会返回这些）。
 *
 * 后端的码一律原样透传，所以调用方 switch(error.code) 时，码只有两个来源：
 * 后端的业务码，或下面这个 502xx 家族。绝不用 `status * 100` 之类的算术合成——
 * 那会撞车：502 * 100 === 50200 与"连接失败"同码，500 * 100 === 50000 与后端
 * 自己的 internal error 同码，调用方无法区分。
 */
export const ERR_UNREACHABLE = 50200; // 连不上后端（fetch 抛异常）
export const ERR_MALFORMED = 50201; // 2xx 但响应体为空或非 JSON
export const ERR_UNRECOGNIZED = 50202; // 错误响应体里没有可用的 code 字段

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: BackendError };

export type RegisteredUser = { id: number; email: string };
export type LoginResult = { token: string };
export type CurrentUser = { id: number; email: string; role: string };

export type Credentials = { email: string; password: string };

function backendUrl(path: string): string {
  const base = process.env.BACKEND_URL ?? "http://localhost:8080";
  return `${base.replace(/\/$/, "")}/api/v1${path}`;
}

async function request<T>(path: string, init: RequestInit): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(backendUrl(path), init);
  } catch {
    return { ok: false, status: 502, error: { code: ERR_UNREACHABLE, message: "backend unreachable" } };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = body as Partial<BackendError> | null;
    return {
      ok: false,
      status: res.status,
      error: {
        code: typeof err?.code === "number" ? err.code : ERR_UNRECOGNIZED,
        message: typeof err?.message === "string" ? err.message : "unexpected error",
      },
    };
  }

  // A 2xx with an empty/unparseable body would otherwise be handed to callers as
  // `data: null` despite a non-null type. Surface it as a structured failure instead.
  if (body === null) {
    return {
      ok: false,
      status: 502,
      error: { code: ERR_MALFORMED, message: "malformed backend response" },
    };
  }
  return { ok: true, data: body as T };
}

const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function registerUser(creds: Credentials): Promise<Result<RegisteredUser>> {
  return request<RegisteredUser>("/auth/register", jsonPost(creds));
}

export function loginUser(creds: Credentials): Promise<Result<LoginResult>> {
  return request<LoginResult>("/auth/login", jsonPost(creds));
}

export function fetchMe(token: string): Promise<Result<CurrentUser>> {
  return request<CurrentUser>("/me", {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}
```

- [x] **Step 4: 运行测试确认通过**

```bash
npm test
```

期望：`Test Files 1 passed`，15 个测试全绿（初版 7 个，代码审查后补到 15：2xx 空响应体、非 JSON 错误体、缺 code 字段、400/40000、500/50000）。

- [x] **Step 5: 提交**

```bash
git add lib/backend.ts tests/backend.test.ts
git commit -m "feat: Go 后端 HTTP 客户端与 Result 错误类型"
```

---

## Task 4: session cookie 辅助 lib/session.ts

**Files:**
- Create: `lib/cookie-name.ts`
- Create: `lib/session.ts`

无独立单元测试——这层只是 `next/headers` 的极薄封装，逻辑由 Task 9 的端到端测试覆盖。给它单独一个文件是为了让 cookie 名称与属性只有一处定义。

- [x] **Step 1: cookie 名称单独成文件**

`lib/cookie-name.ts`：

```ts
export const TOKEN_COOKIE = "image_token";
```

为什么要单独一个文件：`proxy.ts`（Next 16 的 Middleware）跑在 Edge 运行时，**不能** import `next/headers`。如果它从 `lib/session.ts` 取常量，就会把 `next/headers` 一起拉进 Edge bundle 而构建失败。常量放在无依赖的模块里，两边都能安全引用。

- [x] **Step 2: 实现 session 辅助**

`lib/session.ts`：

```ts
import { cookies } from "next/headers";

export { TOKEN_COOKIE } from "@/lib/cookie-name";
import { TOKEN_COOKIE } from "@/lib/cookie-name";

/** 与后端 JWT 有效期保持一致：7 天（internal/auth/jwt.go） */
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export async function getToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(TOKEN_COOKIE)?.value;
}

export async function setToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearToken(): Promise<void> {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
}
```

注意：Next.js 16 里 `cookies()` 返回 Promise，必须 `await`。

- [x] **Step 3: 确认类型检查通过**

```bash
npx tsc --noEmit
```

期望：无输出（通过）。

- [x] **Step 4: 提交**

```bash
git add lib/session.ts lib/cookie-name.ts
git commit -m "feat: httpOnly cookie 会话辅助函数"
```

---

## Task 5: BFF Route Handlers

**Files:**
- Create: `app/api/auth/register/route.ts`
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`

- [x] **Step 1: 实现注册转发**

`app/api/auth/register/route.ts`：

```ts
import { NextResponse } from "next/server";
import { registerUser } from "@/lib/backend";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json(
      { code: 40000, message: "email and password are required" },
      { status: 400 },
    );
  }

  const res = await registerUser({ email, password });
  if (!res.ok) {
    return NextResponse.json(res.error, { status: res.status });
  }
  return NextResponse.json(res.data, { status: 201 });
}
```

注册后**不自动登录**——保持与后端契约一致（register 不返回 token），前端注册成功后引导用户去登录页。

- [x] **Step 2: 实现登录转发并写 cookie**

`app/api/auth/login/route.ts`：

```ts
import { NextResponse } from "next/server";
import { loginUser } from "@/lib/backend";
import { setToken } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json(
      { code: 40000, message: "email and password are required" },
      { status: 400 },
    );
  }

  const res = await loginUser({ email, password });
  if (!res.ok) {
    return NextResponse.json(res.error, { status: res.status });
  }
  await setToken(res.data.token);
  // token 只留在 httpOnly cookie 里，不回传给浏览器 JS
  return NextResponse.json({ ok: true });
}
```

- [x] **Step 3: 实现登出**

`app/api/auth/logout/route.ts`：

```ts
import { NextResponse } from "next/server";
import { clearToken } from "@/lib/session";

export async function POST() {
  await clearToken();
  return NextResponse.json({ ok: true });
}
```

- [x] **Step 4: 手工验证三个路由**

先确认 Go 后端在跑，然后 `npm run dev`，另起终端：

```bash
curl -s -w "\n[%{http_code}]\n" -X POST localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"front1@example.com","password":"secret12345"}'
```

期望 `[201]` 与 `{"id":...,"email":"front1@example.com"}`。

```bash
curl -s -i -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"front1@example.com","password":"secret12345"}' | grep -i -e set-cookie -e '^HTTP'
```

期望看到 `HTTP/1.1 200 OK` 和 `set-cookie: image_token=eyJ...; Path=/; HttpOnly; SameSite=Lax`。

```bash
curl -s -w "\n[%{http_code}]\n" -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"front1@example.com","password":"wrongpass"}'
```

期望 `[401]` 与 `{"code":40101,"message":"invalid email or password"}`。

- [x] **Step 5: 提交**

```bash
git add app/api
git commit -m "feat: BFF 认证路由（注册/登录/登出），JWT 存 httpOnly cookie"
```

---

## Task 6: 认证表单组件与登录/注册页

**Files:**
- Create: `components/auth-form.tsx`
- Create: `app/login/page.tsx`
- Create: `app/register/page.tsx`

- [x] **Step 1: 实现共用表单组件**

`components/auth-form.tsx`：

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "login" | "register";

const COPY: Record<Mode, { title: string; submit: string; altText: string; altHref: string; altLabel: string }> = {
  login: {
    title: "Sign in",
    submit: "Sign in",
    altText: "No account yet?",
    altHref: "/register",
    altLabel: "Create one",
  },
  register: {
    title: "Create account",
    submit: "Create account",
    altText: "Already registered?",
    altHref: "/login",
    altLabel: "Sign in",
  },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? "Something went wrong");
        return;
      }
      if (mode === "register") {
        router.push("/login?registered=1");
      } else {
        router.push("/account");
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={8}
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {mode === "register" && (
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Please wait…" : copy.submit}
      </Button>

      <p className="text-sm text-muted-foreground">
        {copy.altText}{" "}
        <Link href={copy.altHref} className="underline">
          {copy.altLabel}
        </Link>
      </p>
    </form>
  );
}
```

密码 `minLength={8}` 与后端 `binding:"min=8,max=72"` 对齐，避免白跑一次请求。

- [x] **Step 2: 实现登录页**

`app/login/page.tsx`：

```tsx
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const { registered } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-sm py-16">
      {registered && (
        <p className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
          Account created. Please sign in.
        </p>
      )}
      <AuthForm mode="login" />
    </div>
  );
}
```

Next.js 16 中 `searchParams` 是 Promise，必须 `await`。

- [x] **Step 3: 实现注册页**

`app/register/page.tsx`：

```tsx
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <div className="mx-auto w-full max-w-sm py-16">
      <AuthForm mode="register" />
    </div>
  );
}
```

- [x] **Step 4: 类型检查**

```bash
npx tsc --noEmit
```

期望：无输出。

- [x] **Step 5: 提交**

```bash
git add components/auth-form.tsx app/login app/register
git commit -m "feat: 登录与注册页面及共用认证表单"
```

---

## Task 7: 账户页与路由保护

**Files:**
- Create: `app/account/page.tsx`
- Create: `proxy.ts`

- [x] **Step 1: 实现账户页（Server Component）**

`app/account/page.tsx`：

```tsx
import { redirect } from "next/navigation";
import { fetchMe } from "@/lib/backend";
import { getToken } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/components/logout-button";

export default async function AccountPage() {
  const token = await getToken();
  if (!token) redirect("/login");

  const res = await fetchMe(token);
  if (!res.ok) {
    if (res.status === 401) redirect("/login");
    throw new Error(`backend error ${res.status}: ${res.error.message}`);
  }

  const user = res.data;
  return (
    <div className="mx-auto w-full max-w-md py-16">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label="User ID" value={String(user.id)} />
          <Row label="Email" value={user.email} />
          <Row label="Role" value={user.role} />
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span data-testid={`account-${label.toLowerCase().replace(" ", "-")}`} className="font-medium">
        {value}
      </span>
    </div>
  );
}
```

- [x] **Step 2: 实现登出按钮**

`components/logout-button.tsx`：

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
```

- [x] **Step 3: 实现 proxy 快速拦截**

`proxy.ts`（放在项目根，与 `app/` 同级。Next 16 把 Middleware 改名为 Proxy——文件叫 `proxy.ts`，导出的函数叫 `proxy`，功能与旧 middleware 完全一致）：

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { TOKEN_COOKIE } from "@/lib/cookie-name";

export function proxy(req: NextRequest) {
  if (!req.cookies.has(TOKEN_COOKIE)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/account/:path*"],
};
```

proxy 只看 cookie 在不在（Edge 运行时不做签名校验，也不该在这里调后端——官方文档明确说 Proxy 不适合做完整的会话/授权方案，只适合乐观检查）。token 过期/伪造的情况由 `/account` 服务端拿到 401 后 `redirect("/login")` 兜住。

- [x] **Step 4: 手工验证**

`npm run dev` 后：

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" localhost:3000/account
```

期望：`307 -> http://localhost:3000/login`（无 cookie 被 proxy 拦下）。

带 cookie 再试：

```bash
curl -s -c /tmp/if-cookies.txt -X POST localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"front1@example.com","password":"secret12345"}' > /dev/null
curl -s -b /tmp/if-cookies.txt localhost:3000/account | grep -o 'front1@example.com'
```

期望：输出 `front1@example.com`。

- [x] **Step 5: 提交**

```bash
git add app/account components/logout-button.tsx proxy.ts
git commit -m "feat: 账户页展示当前用户，proxy 保护受限路由"
```

---

## Task 8: 落地页与顶栏

**Files:**
- Create: `components/site-header.tsx`
- Modify: `app/layout.tsx`（挂顶栏、改 metadata）
- Modify: `app/page.tsx`（替换脚手架默认内容）

- [x] **Step 1: 实现顶栏**

`components/site-header.tsx`：

```tsx
import Link from "next/link";
import { getToken } from "@/lib/session";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const signedIn = Boolean(await getToken());
  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="font-semibold">
          Image Studio
        </Link>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Button variant="ghost" nativeButton={false} render={<Link href="/account" />}>
              Account
            </Button>
          ) : (
            <>
              <Button variant="ghost" nativeButton={false} render={<Link href="/login" />}>
                Sign in
              </Button>
              <Button nativeButton={false} render={<Link href="/register" />}>
                Get started
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
```

顶栏按 cookie 存在性切换，不调后端——避免每次导航都打一次 `/me`。

- [x] **Step 2: 挂到根布局**

修改 `app/layout.tsx`：把 `metadata` 改成本项目的，并在 `<body>` 内 `children` 之前插入 `<SiteHeader />`。保留脚手架生成的字体变量与 `globals.css` 引入不要动。改完后 body 部分形如：

```tsx
export const metadata: Metadata = {
  title: "Image Studio",
  description: "AI image generation, by subscription.",
};
```

```tsx
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SiteHeader />
        <main>{children}</main>
      </body>
```

并在文件顶部加 `import { SiteHeader } from "@/components/site-header";`。

- [x] **Step 3: 替换落地页**

`app/page.tsx`（整体替换脚手架内容）：

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center">
      <h1 className="text-balance text-5xl font-semibold tracking-tight">
        Generate images your way
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
        Pick a model, describe what you want, and get results in seconds.
        Subscribe monthly or top up whenever you need more.
      </p>
      <div className="mt-10 flex justify-center gap-3">
        <Button size="lg" nativeButton={false} render={<Link href="/register" />}>
          Get started free
        </Button>
        <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/login" />}>
          Sign in
        </Button>
      </div>
    </section>
  );
}
```

M1 不做示例图墙（需要 R2 与真实产出图，属于后续里程碑）。

- [x] **Step 4: 构建验证**

```bash
npm run build
```

期望：编译成功，路由清单里出现 `/`、`/login`、`/register`、`/account` 与三个 `/api/auth/*`。

- [x] **Step 5: 提交**

```bash
git add app/layout.tsx app/page.tsx components/site-header.tsx
git commit -m "feat: 落地页与登录态感知顶栏"
```

---

## Task 9: 端到端测试（Playwright）

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/auth.spec.ts`
- Modify: `package.json`（加 `test:e2e` 脚本）
- Modify: `.gitignore`（忽略 `test-results/`、`playwright-report/`）

**注意：** 本任务的测试需要 Go 后端在 `localhost:8080` 运行。Playwright 的 `webServer` 只负责起前端。

- [x] **Step 1: 安装 Playwright**

```bash
npm i -D @playwright/test
npx playwright install chromium
```

- [x] **Step 2: 写配置**

`playwright.config.ts`：

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
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
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

`workers: 1` + `fullyParallel: false`：测试共用一个真实后端数据库，串行跑避免互相干扰。

- [x] **Step 3: 写失败的端到端测试**

`e2e/auth.spec.ts`：

```ts
import { test, expect } from "@playwright/test";

/** 每次运行用不同邮箱，避免撞后端唯一索引 */
function uniqueEmail() {
  return `e2e-${process.pid}-${test.info().parallelIndex}-${Date.now()}@example.com`;
}

const PASSWORD = "secret12345";

test("未登录访问 /account 被重定向到 /login", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
});

test("注册 → 登录 → 账户页 → 登出 全流程", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/login\?registered=1$/);
  await expect(page.getByText("Account created. Please sign in.")).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId("account-email")).toHaveText(email);
  await expect(page.getByTestId("account-role")).toHaveText("user");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
  // 必须限定在 header 内：落地页正文也有一个 "Sign in" 链接，
  // 不限定范围会命中两个元素，触发 Playwright 严格模式报错。
  await expect(page.locator("header").getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("重复邮箱注册显示后端错误文案", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert")).toHaveText("email already registered");
});

test("密码错误显示后端错误文案", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("totallywrong1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("invalid email or password");
});
```

- [x] **Step 4: 加脚本并运行**

`package.json` 的 `scripts` 加：

```json
"test:e2e": "playwright test"
```

确认 Go 后端在跑，然后：

```bash
npm run test:e2e
```

期望：`4 passed`。如果有失败，先看 `playwright-report/`（`npx playwright show-report`）里的 trace 定位是前端选择器问题还是后端响应问题。

- [x] **Step 5: 忽略测试产物**

```bash
printf 'test-results/\nplaywright-report/\n' >> .gitignore
```

- [x] **Step 6: 提交**

```bash
git add playwright.config.ts e2e package.json .gitignore
git commit -m "test: Playwright 端到端覆盖注册/登录/账户/登出全流程"
```

---

## Task 10: README 与最终验证

**Files:**
- Create: `README.md`（覆盖脚手架默认的）

- [x] **Step 1: 写 README**

`README.md` 的完整内容（下面的四重反引号是本计划的围栏，写文件时不要包含它）：

````markdown
# image-front

AI 图像生成订阅平台前端（Next.js 16 + Tailwind v4 + shadcn/ui）。

设计文档：`../image-backend/docs/superpowers/specs/2026-07-27-image-platform-design.md`

## 本地运行

需要先启动后端（另一个仓库 `image-backend`）：

```
cd ../image-backend && PORT=8080 JWT_SECRET=dev-secret-change-me go run ./cmd/server
```

再启动前端：

```
cp .env.example .env.local   # BACKEND_URL 指向后端
npm install
npm run dev                  # http://localhost:3000
```

## 架构

浏览器只与 Next.js 同源通信；`app/api/auth/*` 的 Route Handler 在服务端转发到 Go 后端，
JWT 存 httpOnly cookie（`image_token`，7 天，与后端 JWT 有效期一致）。

- `lib/backend.ts` —— 唯一直连 Go 后端的模块
- `lib/session.ts` —— 唯一定义 cookie 名称与属性的模块
- `proxy.ts` —— `/account` 无 cookie 直接跳 `/login`

## 页面（M1）

| 路由 | 说明 |
|---|---|
| `/` | 落地页 |
| `/register` | 邮箱注册 |
| `/login` | 邮箱登录 |
| `/account` | 当前用户信息 + 登出 |

## 开发命令

```
npm run build       # 提交前必跑
npm test            # Vitest 单元测试
npm run test:e2e    # Playwright 端到端（需后端在跑）
```
````

- [x] **Step 2: 全量验证**

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build && npm run test:e2e
```

期望：lint 无错、tsc 无输出、Vitest 全绿、build 成功、Playwright `4 passed`。

- [x] **Step 3: 提交**

```bash
git add README.md
git commit -m "docs: 前端本地运行与架构说明"
```

---

## 不在本计划范围内（后续里程碑）

- Google / GitHub OAuth 登录（规格第 8 节列了，但后端尚无对应接口）
- `/pricing`、`/generate`、`/history`、`/gallery`、`/admin/*`
- 邮箱验证邮件、忘记密码
- 落地页示例图墙（依赖 R2 与真实生成结果）
- 深色模式切换（Tailwind 变量已就绪，但 M1 不做切换器）

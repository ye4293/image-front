import type {
  AspectRatio,
  CreditBalance,
  Generation,
  GenerationPage,
  ImageModel,
  Plan,
  Subscription,
} from "@/lib/generation-types";

export type BackendError = { code: number; message: string };

/**
 * 本模块自己合成的错误码（后端不会返回这些）。
 *
 * 后端的码一律原样透传，所以调用方 switch(error.code) 时，码只有两个来源：
 * 后端的业务码，或下面这个 502xx 家族。绝不用 `status * 100` 之类的算术合成——
 * 那会撞车：502 * 100 === 50200 与"连接失败"同码，500 * 100 === 50000 与后端
 * 自己的 internal error 同码，调用方无法区分。
 *
 * 补充：路由层（app/api/auth/*）在请求到达后端之前自行拒绝时，也会发出 40000
 * （请求体不合法）与 40300（跨站请求被拒）。语义与后端的同名码一致，故复用而非
 * 另起一个前端专属码段。
 */
export const ERR_UNREACHABLE = 50200; // 连不上后端（fetch 抛异常）
export const ERR_MALFORMED = 50201; // 2xx 但响应体为空或非 JSON
export const ERR_UNRECOGNIZED = 50202; // 错误响应体里没有可用的 code 字段

/**
 * 业务错误码。这些是**wire 契约**——浏览器端也要按码分支（例如工作台比较
 * 40001 决定是否弹升级框），因此必须只有一处声明。以前 `lib/bff.ts` 与
 * `app/api/generations/route.ts` 各自声明了同名同值的局部常量，改一处漏一处
 * 的风险是实打实的。语义与后端的同名码一致，故复用而非另起前端专属码段。
 */
export const ERR_BAD_REQUEST = 40000; // 请求体不合法（缺字段、字段非法、未知枚举值）
export const ERR_INSUFFICIENT_CREDITS = 40001; // 余额不足，HTTP 402
/**
 * 模型**存在但当前不可用**（被禁用、上游降级）。注意与 40000 的区别：未知的
 * model id 是请求格式错误（过期的客户端），要回 40000；把两者混为一谈会让
 * 前端对一个过期客户端显示"模型不可用"，用户去等一个永远不会恢复的模型。
 * 本轮假数据里所有模型恒定可用，故没有代码路径发出此码——它为真后端预留。
 */
export const ERR_MODEL_UNAVAILABLE = 40003;
export const ERR_FORBIDDEN = 40300; // 跨站请求被拒

/**
 * 计费相关的业务码。**两处与既有常量同值，这不是笔误，也不要"去重"**：
 *
 * - `ERR_NO_BILLING_ACCOUNT`（40001）与 `ERR_INSUFFICIENT_CREDITS`（40001）同值。
 *   后端在两个不同的接口上复用了这个码：`/generations` 上它是余额不足，
 *   `/billing/portal` 上它是"该用户还没有 Stripe customer"。**码只在自己的接口
 *   范围内有意义**，所以消费方必须按"哪个接口回的"来解释它，绝不能建一张全局的
 *   码→文案表（那张表会在这里撞车，然后给一个没结过账的用户显示"次数不够"）。
 * - `ERR_PAYMENT_PROVIDER`（50200）与 `ERR_UNREACHABLE`（50200）同值。后者是本
 *   模块合成的"连不上后端"，前者是后端合成的"连不上 Stripe"。两者对用户的意思
 *   恰好一致（服务暂时不可用、稍后重试），而且都会被 `lib/bff.ts` 的
 *   `INFRA_CODES` 换成通用文案，所以撞车在展示层无害；但**不要**据此推断
 *   "50200 一定来自后端"。
 */
export const ERR_NO_BILLING_ACCOUNT = 40001; // /billing/portal：用户还没结过账，没有 customer
export const ERR_PAYMENT_PROVIDER = 50200; // 支付服务不可用（后端调 Stripe 失败）
export const ERR_BILLING_NOT_CONFIGURED = 50300; // 后端没配 STRIPE_SECRET_KEY
export const ERR_PLAN_NOT_PURCHASABLE = 50301; // 档位存在但还没在 Stripe 建好 Price

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: BackendError };

export type RegisteredUser = { id: number; email: string };
export type LoginResult = { token: string };
/**
 * `/me` 一并返回余额，所以**没有**独立的余额接口——`/api/credits` 就是取这里的
 * `credits` 字段。多一个后端接口就多一次往返，而且两个来源迟早会在同一屏里
 * 显示出不一致的数字。
 */
export type CurrentUser = {
  id: number;
  email: string;
  role: string;
  credits: CreditBalance;
  /**
   * 订阅摘要，**未订阅时是 `null`**（字段一定存在，不是可选）。
   *
   * 声明成 `subscription?: Subscription` 会让"后端漏发这个字段"和"用户没订阅"变成
   * 同一种情况，而它们的正确处理完全不同：前者是故障，后者是正常状态。
   */
  subscription: Subscription | null;
};

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

/**
 * 可用模型列表。后端这个接口是**公开的**（定价页与落地页都可能要展示），
 * 所以不传 token——加一个用不到的 Bearer 参数只会让调用方以为不登录取不到。
 */
export function listModels(): Promise<Result<{ models: ImageModel[] }>> {
  return request<{ models: ImageModel[] }>("/models", { cache: "no-store" });
}

export type CreateGenerationBody = {
  prompt: string;
  model: string;
  aspectRatio: AspectRatio;
  isPublic: boolean;
};

/**
 * 发起一次生成。后端是**同步**的：连接会挂住直到上游出图（Flux 实测约 21 秒，
 * 慢时更久），因此这里刻意不设自己的超时——超时策略归浏览器侧的
 * `AbortSignal.timeout`（见 workbench.tsx），在这里再加一道只会得到两个互相
 * 打架的期限。
 *
 * 上游失败是**业务失败**：后端回 200 加 `status:"failed"`，`ok` 仍是 true。
 * 判 `res.data.status` 而不是判 `res.ok` 才能区分"生成失败"与"请求没送到"。
 */
export function createGeneration(
  token: string,
  body: CreateGenerationBody,
): Promise<Result<Generation>> {
  return request<Generation>("/generations", {
    ...jsonPost(body),
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

/**
 * 可订阅档位。**公开接口**，不传 token——定价页未登录时就要能看，加一个用不到的
 * Bearer 参数只会让调用方以为不登录取不到。
 *
 * `cache: "no-store"`：运营在后台改价或下架某档之后，定价页必须立刻反映。被 Next
 * 的数据缓存留住的旧价格会让用户看到一个和结账页金额不一致的数字，那是最坏的一种
 * 陈旧数据。
 */
export function listPlans(): Promise<Result<{ plans: Plan[] }>> {
  return request<{ plans: Plan[] }>("/plans", { cache: "no-store" });
}

/**
 * 创建 Stripe Checkout 会话，返回要跳转过去的 URL。
 *
 * **只传 planId**。价格与 Stripe Price 由后端查表决定——让客户端传 price 等于让它
 * 指定自己付多少钱。
 *
 * 已知失败：40000（未知或已下架的档位）、50301（该档还没在 Stripe 建好 Price，是
 * 我们的运维状态问题）、50300（后端没配 Stripe）、50200（Stripe 不可达）。
 * 这几个码对用户的含义各不相同，调用方要分开给文案，见 `lib/billing-errors.ts`。
 */
export function createCheckout(token: string, planId: string): Promise<Result<{ checkoutUrl: string }>> {
  return request<{ checkoutUrl: string }>("/billing/subscribe", {
    ...jsonPost({ planId }),
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

/**
 * 创建 Stripe Billing Portal 会话（换卡 / 取消 / 看发票），返回要跳转过去的 URL。
 *
 * 无请求体：要打开谁的账单中心由 token 决定，绝不由客户端传 customer id。
 *
 * 已知失败：40001（该用户还没有 Stripe customer，即没结过账）、50300、50200。
 */
export function createPortal(token: string): Promise<Result<{ portalUrl: string }>> {
  return request<{ portalUrl: string }>("/billing/portal", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

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

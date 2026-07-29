import { NextResponse } from "next/server";
import { ERR_BAD_REQUEST, ERR_FORBIDDEN, createGeneration } from "@/lib/backend";
import { checkSameOrigin, toClientError } from "@/lib/bff";
import { getToken } from "@/lib/session";
import { ASPECT_RATIOS, type AspectRatio } from "@/lib/generation-types";

/**
 * Vercel 上 Route Handler 就是 serverless 函数，有执行时长上限。
 *
 * **Pro 套餐的默认值仍然是 60 秒**——买了套餐不等于自动放宽，必须在这里显式声明。
 * 而本路由要挂住连接等后端出图：Flux 实测 26 秒，设计上最慢的模型约 3 分钟。
 * 少了这一行，慢一点的生成会在 60 秒被平台掐断成 504，**而后端那边次数已经扣了、
 * 图还在继续生成**——用户付了钱，看到的是超时。
 *
 * 300 是 Pro 的上限。本地开发与自托管会忽略该导出，不受影响。
 */
export const maxDuration = 300;

/**
 * 生成转交后端 `POST /api/v1/generations`，浏览器永远拿不到 token（httpOnly cookie）。
 *
 * 后端是**同步**的：连接挂住直到上游出图。它也刻意不理客户端断开——调上游用的是
 * 脱离请求生命周期的 context（`internal/handler/generations.go`），因为一关标签页就
 * "扣了次数、丢了图"是不可接受的。直接后果：客户端超时的提示文案不能说"次数未被
 * 扣除"，因为确实扣了（见 workbench.tsx 的 timeout 分支）。
 *
 * 上游失败是**业务失败**：后端回 200 + `status:"failed"` + `creditsSpent:0`（次数已
 * 按原拆分退回）。所以这里不把它当错误看，原样透传给工作台。
 */

/**
 * 画幅是字面量联合，不能把任意字符串塞进 `Generation`。**缺失与非法区别待遇**：
 *
 * - 字段缺失（`undefined`）→ 用默认值 `"1:1"`。这是"没填"，给默认值合理。
 * - 字段存在但非法 → 返回 `null`，调用方回 `40000`，**不静默改写**。
 *
 * 后端对不支持的画幅同样回 40000（`internal/generation/aspect.go` 明确拒绝静默纠正
 * 成 1:1）。这里先挡一道只是省一次往返，语义与后端一致，不是第二套规则。
 */
function parseAspectRatio(value: unknown): AspectRatio | null {
  if (value === undefined) return "1:1";
  return (ASPECT_RATIOS as readonly string[]).includes(value as string)
    ? (value as AspectRatio)
    : null;
}

export async function POST(req: Request) {
  const forbidden = checkSameOrigin(req);
  if (forbidden) {
    return NextResponse.json(forbidden.body, { status: forbidden.status });
  }

  const token = await getToken();
  if (!token) {
    return NextResponse.json({ code: ERR_FORBIDDEN, message: "not signed in" }, { status: 401 });
  }

  // `req.json()` 返回 `any`：直接当对象用的话，一个拼错的 `body?.promt` 也能通过
  // 编译并静默退化成 40000。声明为 `unknown` 再显式收窄（同 `lib/bff.ts` 的写法）。
  // ESLint 用的是非类型感知配置，永远抓不到这个。
  const body: unknown = await req.json().catch(() => null);
  const fields = (typeof body === "object" && body !== null ? body : {}) as {
    prompt?: unknown;
    model?: unknown;
    aspectRatio?: unknown;
    isPublic?: unknown;
  };

  const prompt = typeof fields.prompt === "string" ? fields.prompt.trim() : "";
  const modelId = typeof fields.model === "string" ? fields.model : "";
  const isPublic = typeof fields.isPublic === "boolean" ? fields.isPublic : false;

  if (!prompt) {
    return NextResponse.json(
      { code: ERR_BAD_REQUEST, message: "prompt is required" },
      { status: 400 },
    );
  }

  const aspectRatio = parseAspectRatio(fields.aspectRatio);
  if (aspectRatio === null) {
    return NextResponse.json(
      { code: ERR_BAD_REQUEST, message: "aspectRatio is not a supported value" },
      { status: 400 },
    );
  }

  // model id **不在这里查表**：模型列表活在后端 `image_models` 表里，前端再存一份就是
  // 一份必然漂移的副本（运营在后台禁用一个模型，前端的副本不会知道）。未知 id 由后端
  // 回 40000，存在但被禁用的模型回 40003——两者语义不同，见 lib/backend.ts 的注释。
  const res = await createGeneration(token, { prompt, model: modelId, aspectRatio, isPublic });
  if (!res.ok) {
    // 402 + 40001（余额不足）也走这条路，码原样透传——工作台按它弹升级框。
    const out = toClientError(res.error, res.status, "generations");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data, { status: 200 });
}

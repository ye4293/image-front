import { NextResponse } from "next/server";
import { ERR_BAD_REQUEST, ERR_INSUFFICIENT_CREDITS } from "@/lib/backend";
import { checkSameOrigin } from "@/lib/bff";
import {
  ASPECT_RATIOS,
  MODELS,
  PLACEHOLDER_IMAGE_URL,
  applyRefund,
  applySpend,
  getBalance,
  mutateBalance,
  planSpend,
  resolvePromptBehavior,
} from "@/lib/fixtures";
import type { AspectRatio, Generation } from "@/lib/generation-types";

/**
 * `sleep` **刻意不理 `req.signal`**，不要"修好"它。
 *
 * 这是本 mock 最有价值的教学属性，对应设计文档 §2.2 风险一：真后端调用上游时
 * 必须使用**脱离请求生命周期**的 context，否则用户一关页面就成了"扣了次数、
 * 丢了图"。所以客户端 abort 之后服务端继续跑到底、并按结果落库，是正确行为，
 * 不是疏漏。下一个人读到"handler 挂住连接 90 秒还不响应 abort"时请读这段：
 * 把它改成响应 abort，就是把一个正确的 mock 改成演示设计明令禁止的 bug 的 mock。
 *
 * 直接后果：客户端超时的提示文案不能说"次数未被扣除"——因为确实扣了。
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 画幅是字面量联合，不能把任意字符串塞进 `Generation`。**缺失与非法区别待遇**：
 *
 * - 字段缺失（`undefined`）→ 用默认值 `"1:1"`。这是"没填"，给默认值合理。
 * - 字段存在但非法 → 返回 `null`，调用方回 `40000`，**不静默改写**。
 *
 * 为什么不像原先那样一律纠正成 `"1:1"`：`aspectRatio` 与 `model` 一样是来自
 * `<select>` / 按钮组的闭集，而未知 model 是拒绝的，`prompt` 缺失也是拒绝的。
 * 三者没有原则性差别，唯独这里宽容就是在教前端一种真实后端不会有的行为
 * （设计文档 §8 想避免的漂移）。静默纠正还会让"前端发错了值"这个真 bug
 * 永远以 200 通过、无人察觉。
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

  // 未知 model id 是 40000（请求格式错误，通常来自过期的客户端），**不是** 40003。
  // 40003 的语义是"模型存在但当前不可用"——见 `lib/backend.ts` 的注释。混用会让
  // 用户去等一个永远不会恢复的模型。
  const model = MODELS.find((m) => m.id === modelId);
  if (!model) {
    return NextResponse.json({ code: ERR_BAD_REQUEST, message: "unknown model" }, { status: 400 });
  }

  // 扣费。真实后端这里是条件原子更新 + 同事务写流水，杜绝并发扣成负数。
  //
  // 注意这三行之间**没有 await**——Node 单线程下这才让 read→plan→write 成为原子。
  // 千万不要把 `getBalance()` 的结果留到 `await sleep` 之后再写回去，那样两个
  // 并发提交会静默丢掉一次扣费。写入一律走 `mutateBalance`，它只接受同步回调。
  const split = planSpend(getBalance(), model.credits);
  if (!split) {
    return NextResponse.json(
      { code: ERR_INSUFFICIENT_CREDITS, message: "not enough credits" },
      { status: 402 },
    );
  }
  mutateBalance((current) => applySpend(current, split));

  const behavior = resolvePromptBehavior(prompt);
  await sleep(behavior.delayMs);

  if (behavior.outcome === "failed") {
    // 退款按扣费时记录的拆分还回，而不是笼统还成月度次数。
    // 走 `mutateBalance` 的增量写入而非"读快照—改—整体写回"：上面刚 await 过
    // 最长 90 秒，任何跨过 await 的余额快照都已经过期。
    mutateBalance((current) => applyRefund(current, split));
    const failed: Generation = {
      id: crypto.randomUUID(),
      model: model.id,
      prompt,
      aspectRatio,
      isPublic,
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
    isPublic,
    status: "succeeded",
    imageUrl: PLACEHOLDER_IMAGE_URL,
    creditsSpent: model.credits,
    createdAt: new Date().toISOString(),
  };
  return NextResponse.json(succeeded, { status: 200 });
}

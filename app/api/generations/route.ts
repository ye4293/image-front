import { NextResponse } from "next/server";
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

const ERR_BAD_REQUEST = 40000;
const ERR_INSUFFICIENT_CREDITS = 40001;
const ERR_MODEL_UNAVAILABLE = 40003;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 画幅现在是字面量联合，不能把任意字符串塞进 `Generation`。非法值退回 "1:1"。 */
function toAspectRatio(value: unknown): AspectRatio {
  return (ASPECT_RATIOS as readonly string[]).includes(value as string)
    ? (value as AspectRatio)
    : "1:1";
}

export async function POST(req: Request) {
  const forbidden = checkSameOrigin(req);
  if (forbidden) {
    return NextResponse.json(forbidden.body, { status: forbidden.status });
  }

  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const modelId = typeof body?.model === "string" ? body.model : "";
  const aspectRatio = toAspectRatio(body?.aspectRatio);

  if (!prompt) {
    return NextResponse.json(
      { code: ERR_BAD_REQUEST, message: "prompt is required" },
      { status: 400 },
    );
  }

  const model = MODELS.find((m) => m.id === modelId);
  if (!model) {
    return NextResponse.json(
      { code: ERR_MODEL_UNAVAILABLE, message: "model is not available" },
      { status: 400 },
    );
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
    // 用 mutateBalance 而非 setBalance(applyRefund(getBalance(), ...))：
    // 上面刚 await 过 90 秒，任何被跨过 await 的余额快照都已经过期。
    mutateBalance((current) => applyRefund(current, split));
    const failed: Generation = {
      id: crypto.randomUUID(),
      model: model.id,
      prompt,
      aspectRatio,
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
    status: "succeeded",
    imageUrl: PLACEHOLDER_IMAGE_URL,
    creditsSpent: model.credits,
    createdAt: new Date().toISOString(),
  };
  return NextResponse.json(succeeded, { status: 200 });
}

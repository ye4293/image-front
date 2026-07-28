import { NextResponse } from "next/server";
import { listModels } from "@/lib/backend";
import { toClientError } from "@/lib/bff";

/**
 * 模型列表来自后端 `GET /api/v1/models`（后端侧是公开接口，不需要 token）。
 *
 * 只读，故不过同源守卫（`checkSameOrigin` 防的是 CSRF，只有写操作才需要）。
 */
export async function GET() {
  const res = await listModels();
  if (!res.ok) {
    const out = toClientError(res.error, res.status, "models");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data);
}

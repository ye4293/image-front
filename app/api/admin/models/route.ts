import { NextResponse } from "next/server";
import { ERR_FORBIDDEN, fetchAdminModels } from "@/lib/backend";
import { toClientError } from "@/lib/bff";
import { getToken } from "@/lib/session";

/** 后台模型列表（含已下架）。只读，不过 CSRF 守卫。 */
export async function GET() {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ code: ERR_FORBIDDEN, message: "not signed in" }, { status: 401 });
  }
  const res = await fetchAdminModels(token);
  if (!res.ok) {
    const out = toClientError(res.error, res.status, "admin/models[GET]");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json({ models: res.data });
}

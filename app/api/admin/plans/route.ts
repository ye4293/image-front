import { NextResponse } from "next/server";
import { ERR_FORBIDDEN, fetchAdminPlans } from "@/lib/backend";
import { toClientError } from "@/lib/bff";
import { getToken } from "@/lib/session";

/**
 * 后台档位列表。只读，故不过 CSRF 同源守卫（与 admin/settings[GET] 同一判断）。
 * 非管理员会被后端回 403，toClientError 原样透传。
 */
export async function GET() {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ code: ERR_FORBIDDEN, message: "not signed in" }, { status: 401 });
  }
  const res = await fetchAdminPlans(token);
  if (!res.ok) {
    const out = toClientError(res.error, res.status, "admin/plans[GET]");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json({ plans: res.data });
}

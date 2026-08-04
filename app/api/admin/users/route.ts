import { NextResponse } from "next/server";
import { ERR_FORBIDDEN, fetchAdminUsers } from "@/lib/backend";
import { toClientError } from "@/lib/bff";
import { getToken } from "@/lib/session";

/**
 * 后台用户列表。只读，不过 CSRF 守卫。
 *
 * 查询参数原样转发给后端：过滤值的合法性由后端校验（它会对 role=admins 这类打错字
 * 回 400 而不是静默返回空列表——静默的话运营会以为"真的没有管理员"）。
 */
export async function GET(req: Request) {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ code: ERR_FORBIDDEN, message: "not signed in" }, { status: 401 });
  }
  const url = new URL(req.url);
  const res = await fetchAdminUsers(token, {
    q: url.searchParams.get("q") ?? undefined,
    role: url.searchParams.get("role") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: Number(url.searchParams.get("limit")) || undefined,
  });
  if (!res.ok) {
    const out = toClientError(res.error, res.status, "admin/users[GET]");
    return NextResponse.json(out.body, { status: out.status });
  }
  return NextResponse.json(res.data);
}

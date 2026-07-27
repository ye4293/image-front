import { redirect } from "next/navigation";
import { fetchMe } from "@/lib/backend";
import { getToken } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/components/logout-button";

export default async function AccountPage() {
  const token = await getToken();
  if (!token) redirect("/login");

  const res = await fetchMe(token);

  // 401 = token 无效/过期，唯一出路是重新登录。这是 proxy 只查 cookie 存在性
  // 之后的兜底。
  if (!res.ok && res.status === 401) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-md py-16">
      <Card>
        <CardHeader>
          {/* CardTitle 在 shadcn v4 里渲染成 <div>，得自带一个 h1，本页才能和其他
              页面一样恰好有一个标题元素。 */}
          <CardTitle>
            <h1 className="text-xl font-semibold tracking-tight">Account</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {res.ok ? (
            <>
              <Row testId="account-user-id" label="User ID" value={String(res.data.id)} />
              <Row testId="account-email" label="Email" value={res.data.email} />
              <Row testId="account-role" label="Role" value={res.data.role} />
            </>
          ) : (
            // 后端连得上但坏了（或压根连不上）。以前这里 throw，生产环境下就是一张
            // 纯白的 500 页；渲染一张说明卡片更好。
            //
            // 注意**不要**展示 res.error.message：BFF 路由那套「把后端消息换成通用
            // 文案」的映射在这条路径上不生效——本页直接调 lib/backend.ts，没经过
            // route handler。所以这里自己写文案。
            <p className="text-sm text-muted-foreground">
              Can&apos;t reach the service right now. Your account is fine — please
              try again in a moment.
            </p>
          )}
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  testId,
  label,
  value,
}: {
  testId: string;
  label: string;
  value: string;
}) {
  // testId 由调用方显式传入，不再从展示文案推导。之前是
  // `label.toLowerCase().replace(" ", "-")`——只替换第一个空格，而且把 Playwright
  // 选择器与用户可见文案绑死，改一次措辞就能悄悄弄坏端到端测试。
  return (
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span data-testid={testId} className="font-medium">
        {value}
      </span>
    </div>
  );
}

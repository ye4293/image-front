import { getTranslations } from "next-intl/server";
import { fetchMe, listPlans } from "@/lib/backend";
import { getToken } from "@/lib/session";
import { redirect } from "@/i18n/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/components/logout-button";
import { SubscriptionCard } from "@/components/account/subscription-card";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // 用 next-intl 的 redirect 而非 next/navigation 的：后者会把中文用户甩到英文
  // `/login`，语言选择在一次跳转里悄悄丢掉。
  const token = await getToken();
  if (!token) redirect({ href: "/login", locale });

  // 两个请求并发发出。`/me` 只回 planId，档位显示名要靠 `/plans` 查——串行等于把
  // 账户页的首屏时间白白加上一个 RTT。
  //
  // **档位列表失败不影响本页**：`listPlans` 挂了只是查不到显示名，回落成 planId
  // （"pro"）仍然是有意义的信息。绝不能因此让整页报错——用户来这里可能正是为了
  // 打开账单中心换一张卡。
  const [res, plansRes] = await Promise.all([fetchMe(token), listPlans()]);

  // 401 = token 无效/过期，唯一出路是重新登录。这是 proxy 只查 cookie 存在性
  // 之后的兜底。
  if (!res.ok && res.status === 401) redirect({ href: "/login", locale });

  const t = await getTranslations("Account");

  return (
    <div className="mx-auto w-full max-w-md py-16">
      <Card>
        <CardHeader>
          {/* CardTitle 在 shadcn v4 里渲染成 <div>，得自带一个 h1，本页才能和其他
              页面一样恰好有一个标题元素。 */}
          <CardTitle>
            <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {res.ok ? (
            <>
              <Row testId="account-user-id" label={t("userId")} value={String(res.data.id)} />
              <Row testId="account-email" label={t("email")} value={res.data.email} />
              {/* role 是后端返回的枚举值（"user" / "admin"），不是展示文案——不本地化。
                  端到端测试也在断言它的原始值。 */}
              <Row testId="account-role" label={t("role")} value={res.data.role} />
              <SubscriptionCard
                subscription={res.data.subscription}
                planName={planDisplayName(plansRes, res.data.subscription?.planId)}
              />
            </>
          ) : (
            // 后端连得上但坏了（或压根连不上）。以前这里 throw，生产环境下就是一张
            // 纯白的 500 页；渲染一张说明卡片更好。
            //
            // 注意**不要**展示 res.error.message：BFF 路由那套「把后端消息换成通用
            // 文案」的映射在这条路径上不生效——本页直接调 lib/backend.ts，没经过
            // route handler。所以这里自己写文案（现在走词条）。
            <p className="text-sm text-muted-foreground">{t("unreachable")}</p>
          )}
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * planId → 档位显示名。查不到（档位列表请求失败、或该档已被下架而 `/plans` 不再
 * 返回它）时回落成 planId 本身——**绝不显示空白**：一个订阅着 Pro 的用户看到档位
 * 那一行是空的，只会以为订阅丢了。
 */
function planDisplayName(
  plansRes: Awaited<ReturnType<typeof listPlans>>,
  planId: string | undefined,
): string {
  if (!planId) return "";
  if (!plansRes.ok) return planId;
  return plansRes.data.plans.find((p) => p.id === planId)?.displayName ?? planId;
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
  // i18n 之后这一点更关键：label 现在是词条，日文/韩文里根本没有空格可替。
  return (
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span data-testid={testId} className="font-medium">
        {value}
      </span>
    </div>
  );
}

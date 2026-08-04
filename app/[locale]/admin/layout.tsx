import { getTranslations } from "next-intl/server";
import { fetchMe } from "@/lib/backend";
import { getToken } from "@/lib/session";
import { Link, redirect } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

/**
 * 后台各页共用的鉴权与子导航。
 *
 * **为什么要有这个 layout。** proxy.ts 只检查 cookie 是否存在，不解析 JWT、不看 role
 * ——一个已登录的普通用户可以直接输入 /admin/xxx 走过它。所以每个后台页面都必须自己
 * 拿 /me 判 role。原先只有一个 settings 页，那段逻辑写在页面里；再加三个页面就意味着
 * 抄四遍，而**漏掉任何一个就是信息泄露洞**（普通用户能看到全站用户邮箱、档位定价、
 * 上游配置）。集中到 layout 之后，新增页面自动获得保护，不依赖谁记得抄。
 *
 * 注意 redirect 用 @/i18n/navigation 的版本而不是 next/navigation 的：后者不带语言
 * 前缀，会把中文用户丢到英文登录页。
 */

/** 后台各页。新增页面只要加一项，layout 的鉴权自动覆盖它。 */
const ADMIN_TABS = [
  { href: "/admin/settings", key: "settings" },
  { href: "/admin/plans", key: "plans" },
  { href: "/admin/models", key: "models" },
  { href: "/admin/users", key: "users" },
] as const;

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const token = await getToken();
  if (!token) redirect({ href: "/login", locale });

  const meRes = await fetchMe(token);
  // 401 = token 失效或过期，回登录页。
  if (!meRes.ok && meRes.status === 401) redirect({ href: "/login", locale });

  const t = await getTranslations("AdminNav");

  // 非管理员：**只渲染一句提示，不渲染 children**。
  //
  // 不能只隐藏导航就放 children 过去——那样页面本体仍会去请求后台数据，
  // 而"后端会回 403 所以没事"是个太脆的假设：任何一个新页面忘了处理 403、
  // 或者在渲染前就把数据塞进 HTML，就泄露了。
  if (!meRes.ok || meRes.data.role !== "admin") {
    return (
      <div className="mx-auto w-full max-w-2xl py-16">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("forbidden")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {/*
        子导航。flex-wrap 让它在 375px 上折成两行而不是横向溢出——仓库不用汉堡菜单
        （见 site-header.tsx 的论证），窄屏靠换行解决。
      */}
      <nav aria-label={t("label")} className="mb-6 flex flex-wrap gap-2">
        {ADMIN_TABS.map(({ href, key }) => (
          // 用 Link + buttonVariants 而不是 <Button render={<Link/>}>：本仓的 shadcn
          // 是 v4 + Base UI，没有 asChild，后者会给 <a> 强加 role="button" 而让读屏
          // 播报错误（见 site-header.tsx 的注释）。
          <Link
            key={href}
            href={href}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            {t(key)}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

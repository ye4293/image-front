import { getTranslations } from "next-intl/server";
import { getToken } from "@/lib/session";
import { fetchMe } from "@/lib/backend";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { CreditBadge } from "@/components/credit-badge";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

// 这里刻意用 buttonVariants 给 Link 上样式，而不是 <Button render={<Link/>}>。
// Base UI 的 Button 在 nativeButton={false} 时会往元素上强制写 role="button"，
// 渲染结果是 <a role="button" tabindex="0" href="...">——一个会导航的链接却被
// 播报成按钮，屏幕阅读器用户不知道点了会跳页，键盘预期也对不上（按钮响应空格，
// 链接不）。用 buttonVariants 只取样式，语义仍是货真价实的链接（role=link）。
export async function SiteHeader() {
  const token = await getToken();
  const signedIn = Boolean(token);

  // Fetch /me to determine if the user is an admin. The admin nav entry must
  // only be visible to admins — showing it to regular users leaks that an admin
  // settings page exists. We only make the request when a token is present;
  // the result failure is intentionally ignored (fail-safe: no admin link shown).
  let isAdmin = false;
  if (token) {
    const meRes = await fetchMe(token);
    isAdmin = meRes.ok && meRes.data.role === "admin";
  }

  const t = await getTranslations("Nav");
  return (
    <header className="border-b">
      {/*
        手机（375px）上顶栏刻意**换成两行**，而不是硬塞进一行。

        塞一行只有三条路：让品牌名换行、缩字号、或把导航收进汉堡菜单。第一条就是
        改动前的实际表现——"Image Studio" 被挤成两行、余额徽标贴着它，而这是访客
        看到的第一屏；第二条在 ja/ko 下并不够（那些标签本就更长）；第三条会把余额
        徽标和语言切换器藏起来，而这两个恰恰必须常驻（余额的理由见 credit-badge.tsx
        的调研注释，语言切换器是给看不懂英文的用户用的，藏起来等于没有）。

        所以用 `flex-wrap`：品牌名独占第一行，右侧那组（余额 + 导航 + 语言）整组
        落到第二行。品牌名加 `shrink-0 whitespace-nowrap` 保证它自己永不折行。
        右侧组自己也允许换行，作为 ja/ko 更长标签的兜底。
        桌面端（≥640px）一行装得下，`flex-wrap` 不生效，布局与改动前一致——
        e2e 里"登出后顶栏 Sign in 链接可见"那条断言跑在 1280×720，不受影响。
      */}
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:py-4">
        <Link href="/" className="shrink-0 whitespace-nowrap font-semibold">
          {t("brand")}
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {signedIn ? (
            <>
              <CreditBadge />
              <Link href="/generate" className={buttonVariants({ variant: "ghost" })}>
                {t("generate")}
              </Link>
              <Link href="/history" className={buttonVariants({ variant: "ghost" })}>
                {t("history")}
              </Link>
              <Link href="/account" className={buttonVariants({ variant: "ghost" })}>
                {t("account")}
              </Link>
              {isAdmin && (
                <Link href="/admin/settings" className={buttonVariants({ variant: "ghost" })}>
                  {t("admin")}
                </Link>
              )}
            </>
          ) : (
            <>
              <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
                {t("signIn")}
              </Link>
              <Link href="/register" className={buttonVariants()}>
                {t("getStarted")}
              </Link>
            </>
          )}
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </nav>
    </header>
  );
}

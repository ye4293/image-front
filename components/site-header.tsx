import { getTranslations } from "next-intl/server";
import { getToken } from "@/lib/session";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { CreditBadge } from "@/components/credit-badge";
import { LanguageSwitcher } from "@/components/language-switcher";

// 这里刻意用 buttonVariants 给 Link 上样式，而不是 <Button render={<Link/>}>。
// Base UI 的 Button 在 nativeButton={false} 时会往元素上强制写 role="button"，
// 渲染结果是 <a role="button" tabindex="0" href="...">——一个会导航的链接却被
// 播报成按钮，屏幕阅读器用户不知道点了会跳页，键盘预期也对不上（按钮响应空格，
// 链接不）。用 buttonVariants 只取样式，语义仍是货真价实的链接（role=link）。
export async function SiteHeader() {
  const signedIn = Boolean(await getToken());
  const t = await getTranslations("Nav");
  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="font-semibold">
          {t("brand")}
        </Link>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <>
              <CreditBadge />
              <Link href="/generate" className={buttonVariants({ variant: "ghost" })}>
                {t("generate")}
              </Link>
              <Link href="/account" className={buttonVariants({ variant: "ghost" })}>
                {t("account")}
              </Link>
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
          <LanguageSwitcher />
        </div>
      </nav>
    </header>
  );
}

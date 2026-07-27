import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { TOKEN_COOKIE } from "@/lib/cookie-name";
import { defaultLocale, isLocale, routing } from "@/i18n/routing";

/**
 * Next 16 把 Middleware 改名为 Proxy，且**全项目只允许一个** proxy 文件、一个导出的
 * `proxy` 函数。next-intl 的 `createMiddleware(routing)` 返回的只是一个
 * `(req) => NextResponse` 的普通函数，所以做法是**在 `proxy` 里组合它**，
 * 而不是试图再放一个 proxy 文件（那样第二个会被静默忽略）。
 */
const handleI18nRouting = createMiddleware(routing);

/** 需要登录的路由（已剥掉语言前缀后的路径）。 */
const PROTECTED = /^\/(?:account|generate)(?:\/|$)/;

/**
 * 把 `/zh/account/x` 拆成 `{ locale: "zh", pathname: "/account/x" }`；
 * 裸路径 `/account` 拆成 `{ locale: 默认语言, pathname: "/account" }`。
 *
 * 必须自己剥前缀，不能只匹配裸路径：`localePrefix: "as-needed"` 下 `/zh/account`
 * 是真实存在的 URL，若守卫只认 `/account`，中文用户不登录也能进账户页。
 */
function splitLocale(pathname: string): { locale: string; pathname: string } {
  const [, first, ...rest] = pathname.split("/");
  if (isLocale(first)) {
    return { locale: first, pathname: `/${rest.join("/")}` };
  }
  return { locale: defaultLocale, pathname };
}

export function proxy(req: NextRequest) {
  // 先跑语言路由。它的响应带着 NEXT_LOCALE cookie、指向 `/[locale]/...` 的 rewrite
  // 以及 alternate-link 头——**必须整体返回或转移出去**，不能换成裸的
  // `NextResponse.next()`（那样 cookie 与 rewrite 全丢，页面永远渲染默认语言）。
  const i18nResponse = handleI18nRouting(req);

  // 语言路由自己就要重定向时（cookie/Accept-Language 检测出非默认语言，或补/去前缀）
  // 直接放它走。认证守卫会在重定向后的那一次请求上生效，不必在这里抢跑——抢跑会
  // 丢掉语言归一化，用户可能被永久锚在错误语言上。
  if (i18nResponse.status >= 300 && i18nResponse.status < 400) {
    return i18nResponse;
  }

  const { locale, pathname } = splitLocale(req.nextUrl.pathname);

  if (PROTECTED.test(pathname) && !req.cookies.has(TOKEN_COOKIE)) {
    // 重定向目标要保留访客的语言：从 `/zh/account` 弹出的人应该落在 `/zh/login`，
    // 而不是被顺手切成英文。默认语言按 `as-needed` 走裸路径。
    const loginPath = locale === defaultLocale ? "/login" : `/${locale}/login`;
    const redirect = NextResponse.redirect(new URL(loginPath, req.url));
    // 把语言路由写的 cookie 搬到重定向响应上。不搬的话，首次访问受保护页的访客
    // 语言检测结果会被丢掉，下一次请求又要重新检测一遍。
    for (const cookie of i18nResponse.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  return i18nResponse;
}

export const config = {
  /**
   * 语言路由必须跑在**所有页面**上（`/`、`/login`、`/zh/pricing`…），所以 matcher
   * 不能再只写受保护的两条路由。反向排除项逐条都有理由：
   *   - `api`  ——BFF 路由不能被 rewrite 成 `/en/api/...`（会 404）；
   *   - `_next`——构建产物与图片优化；
   *   - `.*\..*`——带扩展名的静态资源（favicon.ico、placeholder-generation.svg 等）。
   * 不排除的话，守卫与 rewrite 会连 CSS/JS/图片一起处理。
   */
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};

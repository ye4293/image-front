import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";

/**
 * 语言感知的导航原语。**页面与组件里必须用这里的 `Link` / `useRouter` / `redirect`，
 * 不要直接用 `next/link` 与 `next/navigation`**——后者不会补语言前缀，
 * 中文用户点一下 `/pricing` 就被甩回英文界面。
 */
const navigation = createNavigation(routing);

export const { Link, usePathname, useRouter, getPathname } = navigation;

/**
 * `redirect` 单独带显式类型标注地导出。
 *
 * 它的返回类型是 `never`，但 TypeScript 只对**声明处带显式类型标注**的函数应用
 * "调用后代码不可达" 的收窄。直接从解构里拿到的 `redirect` 是推断类型，于是
 * `if (!token) redirect(...)` 之后 `token` 依然是 `string | undefined`，
 * 调用方被迫写 `token!`。加一行标注就把这个收窄要回来了。
 */
export const redirect: typeof navigation.redirect = navigation.redirect;

import { getRequestConfig } from "next-intl/server";
import { isLocale, routing } from "@/i18n/routing";

/**
 * 每次请求解析出当前语言并加载对应词条。next-intl 插件（见 next.config.ts）
 * 会把这个文件的路径编译进 bundle，因此**文件位置不能随便改**。
 */
export default getRequestConfig(async ({ requestLocale }) => {
  // 通常对应 `[locale]` 路由段；但直接命中 404 之类没有该段的请求会拿到 undefined。
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

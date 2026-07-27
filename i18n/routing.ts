import { defineRouting } from "next-intl/routing";

/**
 * 语言列表与前缀策略的单一来源。proxy.ts（Edge 运行时）、i18n/request.ts（服务端）、
 * i18n/navigation.ts（客户端）三处都从这里取，避免各写一份后漂移。
 *
 * 本文件刻意只 import `next-intl/routing`——它是纯配置模块，不含 React，
 * 所以从 Edge 运行时的 proxy.ts 引它是安全的（同 lib/cookie-name.ts 的思路）。
 */
export const locales = ["en", "zh", "ja", "ko"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale = "en" satisfies Locale;

export const routing = defineRouting({
  locales,
  defaultLocale,
  /**
   * `as-needed`：默认语言走裸路径（`/login`、`/generate`），其余语言带前缀（`/zh/login`）。
   *
   * **不要改成 `always`**。现有 Playwright 套件与 proxy.ts 的 matcher 都是按裸路径写的，
   * 改成 `always` 会让 `/login` 变成 `/en/login`，四条端到端测试全部失败，而产品上
   * 没有任何收益（默认语言带前缀只是多一跳重定向）。
   */
  localePrefix: "as-needed",
});

/** 语言在**自己的文字**里的名字。用英文写"Chinese/Japanese"对目标用户毫无帮助。 */
export const localeNames: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
};

/** proxy.ts 用：判断路径首段是否是已知语言。不用 next-intl 的 `hasLocale`——那个
 *  从 `next-intl` 主入口导出，会把 React 相关代码拖进 Edge bundle。 */
export function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}

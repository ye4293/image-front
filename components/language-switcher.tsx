"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { localeNames, locales, type Locale } from "@/i18n/routing";

/**
 * 语言切换器。
 *
 * 用原生 `<select>`，理由与 components/generate/model-selector.tsx 完全相同：
 * Base UI 的 Select 要额外引一层依赖、还要自己补 ARIA，而原生 select 在移动端
 * 直接调系统选择器、键盘与读屏支持天生正确。语言切换是每个页面都在的低频控件，
 * 不值得为它加运行时体积。
 *
 * 语言名一律用**该语言自己的文字**写（中文/日本語/한국어）——用英文写
 * "Chinese/Japanese" 对看不懂英文的目标用户毫无帮助，而这个控件恰恰是给他们的。
 */
export function LanguageSwitcher() {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const router = useRouter();
  // next-intl 的 usePathname 返回的是**剥掉语言前缀**的路径（`/zh/pricing` → `/pricing`），
  // 所以可以直接配上目标语言重新导航，切换时停在同一个页面上。
  const pathname = usePathname();

  return (
    <>
      <label htmlFor="locale-switcher" className="sr-only">
        {t("language")}
      </label>
      <select
        id="locale-switcher"
        data-testid="locale-switcher"
        value={locale}
        onChange={(e) => router.replace(pathname, { locale: e.target.value as Locale })}
        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeNames[l]}
          </option>
        ))}
      </select>
    </>
  );
}

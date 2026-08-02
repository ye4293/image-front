import { getTranslations } from "next-intl/server";

import { HistoryGrid } from "@/components/history-grid";
import { listGenerations } from "@/lib/backend";
import { getToken } from "@/lib/session";
import { redirect } from "@/i18n/navigation";

export async function generateMetadata() {
  const t = await getTranslations("Metadata");
  return { title: t("historyTitle") };
}

/**
 * 历史页。首屏由 RSC 直连 Go（不绕自家 Route Handler——那是多一跳且拿不到任何
 * 好处，见 `pricing/page.tsx` 的同款注释）。
 *
 * proxy 已经拦了未登录（PROTECTED 正则含 history），但这里仍然要判 401：proxy
 * 只检查 cookie **存在**，一个过期或伪造的 token 能过它。
 */
export default async function HistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const token = await getToken();
  if (!token) redirect({ href: "/login", locale });

  const t = await getTranslations("History");

  const res = await listGenerations(token);
  if (!res.ok) {
    // 401 交给 proxy 下一次导航去处理；这一屏给一个不会误导的空态即可。
    return <p>{t("empty")}</p>;
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{t("subtitle")}</p>
      </header>
      <HistoryGrid initial={res.data} />
    </main>
  );
}

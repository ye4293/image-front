"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { HistoryCard } from "@/components/history-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Generation, GenerationPage } from "@/lib/generation-types";

/**
 * 历史网格 + 分页。
 *
 * 用**「加载更多」按钮而不是无限滚动**：无限滚动在 375 宽下会让页脚永远够不着，
 * 而且 Playwright 里难以确定性断言"翻到了第二页"（要靠滚动触发 observer，时序
 * 不稳）。
 *
 * 首屏数据由 RSC 传进来，本组件只负责后续页——所以未登录用户根本走不到这里。
 */
export function HistoryGrid({ initial }: { initial: GenerationPage }) {
  const t = useTranslations("History");
  const [items, setItems] = useState<Generation[]>(initial.generations);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/generations?cursor=${encodeURIComponent(cursor)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const page: GenerationPage = await res.json();
      // 用函数式更新：连点两次「加载更多」时，闭包里的 items 会是旧值，
      // 直接 setItems([...items, ...]) 会丢掉其中一页。
      setItems((prev) => [...prev, ...page.generations]);
      setCursor(page.nextCursor);
    } catch {
      // 不显示后端原文：那些 message 是英文的运维文案，四种语言的界面都会露出
      // 英文。走本地化的通用文案。
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-neutral-600 dark:text-neutral-400">{t("empty")}</p>
        {/* shadcn v4 基于 @base-ui/react，没有 asChild；<Button render={<Link/>}> 会给
            锚点强加 role="button"。所以用 Link + buttonVariants。 */}
        <Link href="/generate" className={buttonVariants()}>
          {t("emptyCta")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 375 宽下两列：单列会让翻一页要滚很久，三列的缩略图小到看不出画面。 */}
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((g) => (
          <HistoryCard key={g.id} generation={g} />
        ))}
      </ul>

      {failed && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {t("loadError")}
        </p>
      )}

      {cursor && (
        <div className="flex justify-center">
          <Button onClick={loadMore} disabled={loading}>
            {loading ? t("loading") : t("loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Generation } from "@/lib/generation-types";

function ElapsedSkeleton() {
  const t = useTranslations("Generate");
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div
      data-testid="generating-skeleton"
      className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border bg-muted/40"
    >
      <div className="h-24 w-24 animate-pulse rounded-lg bg-muted" />
      {/* 显示真实已耗时，而不是假装知道进度——上游没有进度信号。 */}
      <p className="text-sm text-muted-foreground">{t("elapsed", { seconds })}</p>
    </div>
  );
}

export function ResultPanel({
  pending,
  current,
  error,
  recent,
}: {
  pending: boolean;
  current: Generation | null;
  error: string | null;
  /** 缩略图墙只放成功的生成，故收窄——`Generation` 是判别联合，failed 分支没有 imageUrl。 */
  recent: Extract<Generation, { status: "succeeded" }>[];
}) {
  const t = useTranslations("Generate");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      {/*
        结果区的高度必须被**视口**约束住，不能由图片的固有尺寸决定。

        原因：`body` 只有 `min-h-full`（最小高度，不是确定高度），所以父链上的
        `flex-1` 封不住内容——结果图固有 768px 高，会把整页撑到视口以外，于是
        左侧参数列底部锚定的 prompt 与生成按钮被挤到折叠线以下，用户必须滚动
        才能点到主界面上最重要的按钮。空闲态看不出问题（没有图），一出图才复现。

        所以图片用 `max-h-[70vh]` 直接对视口设上限，而不是 `h-full`（后者需要
        父级有确定高度，这里没有）。容器保留 min-h-[320px] 供空/等待态撑开。

        容器改成 flex 列、空/错误/等待态用 `flex-1` 而不是 `h-full`：`h-full` 是
        百分比高度，只在父级高度**确定**时生效。桌面端左右分栏时高度确定，所以看不
        出问题；移动端纵向堆叠后结果区高度由内容决定，`h-full` 退化成 auto，空态框
        塌成一条只有文字高的细条，下面留一大片 min-h-[320px] 撑出来的空白。
        `flex-1` 不依赖确定高度，两种布局下都能撑满（桌面端渲染结果与改动前一致）。

        min-h 在手机上收到 240px：参数面板在上方已经占掉约 400px，结果区顶边落在
        y≈505，再撑 320px 的话居中的空态文案正好压在 667px 折叠线上被切掉一半。
        240px 让文案落在 y≈625（折叠线内），同时框的下沿仍探出屏幕，暗示下面有内容。
      */}
      <div className="flex min-h-[240px] flex-1 flex-col md:min-h-[320px]">
        {pending ? (
          <ElapsedSkeleton />
        ) : error ? (
          <div
            role="alert"
            data-testid="result-error"
            className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 p-6 text-center"
          >
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        ) : current?.status === "succeeded" ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={current.imageUrl}
            alt={current.prompt}
            data-testid="result-image"
            className="max-h-[70vh] w-full rounded-lg border object-contain"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-lg border bg-muted/40 text-sm text-muted-foreground">
            {t("empty")}
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">{t("recent")}</p>
          <div className="flex gap-1.5">
            {recent.map((g) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={g.id}
                src={g.imageUrl}
                alt={g.prompt}
                className="size-11 rounded border object-cover"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

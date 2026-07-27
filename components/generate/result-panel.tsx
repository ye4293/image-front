"use client";

import { useEffect, useState } from "react";
import type { Generation } from "@/lib/generation-types";

function ElapsedSkeleton() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      data-testid="generating-skeleton"
      className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border bg-muted/40"
    >
      <div className="h-24 w-24 animate-pulse rounded-lg bg-muted" />
      {/* 显示真实已耗时，而不是假装知道进度——上游没有进度信号。 */}
      <p className="text-sm text-muted-foreground">已生成 {seconds} 秒…</p>
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
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="min-h-[320px] flex-1">
        {pending ? (
          <ElapsedSkeleton />
        ) : error ? (
          <div
            role="alert"
            data-testid="result-error"
            className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 p-6 text-center"
          >
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        ) : current?.status === "succeeded" ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={current.imageUrl}
            alt={current.prompt}
            data-testid="result-image"
            className="h-full w-full rounded-lg border object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border bg-muted/40 text-sm text-muted-foreground">
            填写左侧参数，点击生成
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">最近生成（仅本次会话）</p>
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

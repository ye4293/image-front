"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ModelSelector } from "@/components/generate/model-selector";
import { Button } from "@/components/ui/button";
import { ASPECT_RATIOS } from "@/lib/fixtures";
import type { ImageModel } from "@/lib/generation-types";

export function ParamPanel({
  models,
  modelId,
  onModelChange,
  aspectRatio,
  onAspectRatioChange,
  prompt,
  onPromptChange,
  onSubmit,
  pending,
  isPublic,
  onIsPublicChange,
}: {
  models: readonly ImageModel[];
  modelId: string;
  onModelChange: (id: string) => void;
  aspectRatio: string;
  onAspectRatioChange: (r: string) => void;
  prompt: string;
  onPromptChange: (p: string) => void;
  onSubmit: () => void;
  pending: boolean;
  isPublic: boolean;
  onIsPublicChange: (v: boolean) => void;
}) {
  const t = useTranslations("Generate");
  const [referenceName, setReferenceName] = useState<string | null>(null);
  const model = models.find((m) => m.id === modelId) ?? models[0];

  return (
    <form
      // 手机上占满宽度、分隔线走下边框（因为结果区在下方而不是右侧）；
      // ≥768px 恢复成原来的 240px 定宽左列 + 右分隔线，桌面端一像素未动。
      className="flex shrink-0 flex-col gap-4 border-b bg-muted/30 p-4 md:w-60 md:border-r md:border-b-0"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <ModelSelector models={models} value={modelId} onChange={onModelChange} disabled={pending} />

      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">{t("aspectRatio")}</span>
        <div className="flex gap-1.5">
          {/* 比例本身（"1:1"、"16:9"）是通用记法，各语言一致，不进词条。 */}
          {ASPECT_RATIOS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={pending}
              aria-pressed={aspectRatio === r}
              onClick={() => onAspectRatioChange(r)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                aspectRatio === r ? "border-foreground font-medium" : "border-input"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="reference" className="text-xs text-muted-foreground">
          {t("reference")}
        </label>
        {/* 本轮不做真实上传（R2 未接入），仅取文件名做本地预览，验证布局是否合理。 */}
        <input
          id="reference"
          type="file"
          accept="image/*"
          disabled={pending || !model.supportsImageToImage}
          onChange={(e) => setReferenceName(e.target.files?.[0]?.name ?? null)}
          className="w-full text-xs file:mr-2 file:rounded file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-xs"
        />
        {!model.supportsImageToImage && (
          <p className="text-xs text-muted-foreground">{t("noImageToImage")}</p>
        )}
        {referenceName && <p className="truncate text-xs">{referenceName}</p>}
      </div>

      {/*
        `mt-auto` 把 prompt 与生成按钮锚在参数列底部——只在参数列是**整列满高**时
        才成立。手机上参数面板变成横向一条、高度由内容决定，`mt-auto` 会把剩余空间
        全塞进这里，在 prompt 上方留下一大片空白并把按钮推下去。所以限定 md 以上生效。
      */}
      <div className="space-y-2 border-t pt-4 md:mt-auto">
        <label htmlFor="prompt" className="sr-only">
          {t("promptLabel")}
        </label>
        <textarea
          id="prompt"
          data-testid="prompt-input"
          rows={3}
          required
          maxLength={2000}
          disabled={pending}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={t("promptPlaceholder")}
          className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" className="flex-1" disabled={pending || !prompt.trim()}>
            {pending ? t("submitPending") : t("submit", { credits: model.credits })}
          </Button>
          <button
            type="button"
            disabled={pending}
            aria-pressed={isPublic}
            title={isPublic ? t("visibilityPublic") : t("visibilityPrivate")}
            onClick={() => onIsPublicChange(!isPublic)}
            className="rounded-md border border-input px-2 py-1.5 text-sm"
          >
            {isPublic ? "🔓" : "🔒"}
          </button>
        </div>
      </div>
    </form>
  );
}

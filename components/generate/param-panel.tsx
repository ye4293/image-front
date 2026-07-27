"use client";

import { useState } from "react";
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
  const [referenceName, setReferenceName] = useState<string | null>(null);
  const model = models.find((m) => m.id === modelId) ?? models[0];

  return (
    <form
      className="flex w-60 shrink-0 flex-col gap-4 border-r bg-muted/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <ModelSelector models={models} value={modelId} onChange={onModelChange} disabled={pending} />

      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">比例</span>
        <div className="flex gap-1.5">
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
          参考图（可选）
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
          <p className="text-xs text-muted-foreground">当前模型不支持图生图</p>
        )}
        {referenceName && <p className="truncate text-xs">{referenceName}</p>}
      </div>

      <div className="mt-auto space-y-2 border-t pt-4">
        <label htmlFor="prompt" className="sr-only">
          Prompt
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
          placeholder="描述你想要的画面…"
          className="w-full resize-none rounded-md border border-input bg-background p-2 text-sm"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" className="flex-1" disabled={pending || !prompt.trim()}>
            {pending ? "生成中…" : `生成 ◆ ${model.credits}`}
          </Button>
          <button
            type="button"
            disabled={pending}
            aria-pressed={isPublic}
            title={isPublic ? "公开到画廊" : "仅自己可见"}
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

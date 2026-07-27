"use client";

import { useState } from "react";
import { ParamPanel } from "@/components/generate/param-panel";
import type { CreditBalance, ImageModel } from "@/lib/generation-types";

export function Workbench({
  models,
  initialBalance,
}: {
  models: readonly ImageModel[];
  initialBalance: CreditBalance;
}) {
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [prompt, setPrompt] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [pending, setPending] = useState(false);
  const [balance] = useState<CreditBalance>(initialBalance);

  return (
    <div className="flex min-h-[calc(100vh-57px)]">
      <ParamPanel
        models={models}
        modelId={modelId}
        onModelChange={setModelId}
        aspectRatio={aspectRatio}
        onAspectRatioChange={setAspectRatio}
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={() => setPending(true)}
        pending={pending}
        isPublic={isPublic}
        onIsPublicChange={setIsPublic}
      />
      <div className="flex-1 p-4 text-sm text-muted-foreground">
        结果区（Task 6 实现）· 余额 {balance.monthly + balance.addon}
      </div>
    </div>
  );
}

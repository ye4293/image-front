"use client";

import { useTranslations } from "next-intl";
import type { ImageModel } from "@/lib/generation-types";

export function ModelSelector({
  models,
  value,
  onChange,
  disabled,
}: {
  models: readonly ImageModel[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Generate");
  return (
    <div className="space-y-1.5">
      <label htmlFor="model" className="text-xs text-muted-foreground">
        {t("model")}
      </label>
      <select
        id="model"
        data-testid="model-selector"
        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {models.map((m) => (
          // 模型名（m.name）是产品标识，不本地化；只有"· N 次"这段计量单位随语言变。
          <option key={m.id} value={m.id}>
            {t("modelOption", { name: m.name, credits: m.credits })}
          </option>
        ))}
      </select>
    </div>
  );
}

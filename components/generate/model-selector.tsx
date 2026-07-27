"use client";

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
  return (
    <div className="space-y-1.5">
      <label htmlFor="model" className="text-xs text-muted-foreground">
        模型
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
          <option key={m.id} value={m.id}>
            {m.name} · {m.credits} 次
          </option>
        ))}
      </select>
    </div>
  );
}

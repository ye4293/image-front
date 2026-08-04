"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_MODEL_CREDITS, type AdminModel } from "@/lib/plan-model-types";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Draft = {
  displayName: string;
  credits: string;
  enabled: boolean;
  sortOrder: string;
};

function toDraft(m: AdminModel): Draft {
  return {
    displayName: m.displayName,
    credits: String(m.credits),
    enabled: m.enabled,
    sortOrder: String(m.sortOrder),
  };
}

/**
 * 模型扣费配置表单。结构与 plans-form 相同（逐行独立保存，理由见那里的注释）。
 */
export function ModelsForm({ models: initial }: { models: AdminModel[] }) {
  const t = useTranslations("AdminModels");
  const [models, setModels] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(initial.map((m) => [m.id, toDraft(m)])),
  );
  const [status, setStatus] = useState<Record<string, SaveStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setStatus((prev) => ({ ...prev, [id]: "idle" }));
  }

  async function save(m: AdminModel) {
    const d = drafts[m.id];
    setStatus((prev) => ({ ...prev, [m.id]: "saving" }));
    setErrors((prev) => ({ ...prev, [m.id]: "" }));

    const updates: Record<string, unknown> = {};
    if (d.displayName !== m.displayName) updates.displayName = d.displayName;
    if (d.enabled !== m.enabled) updates.enabled = d.enabled;
    if (Number(d.credits) !== m.credits) updates.credits = Number(d.credits);
    if (Number(d.sortOrder) !== m.sortOrder) updates.sortOrder = Number(d.sortOrder);

    if (Object.keys(updates).length === 0) {
      setStatus((prev) => ({ ...prev, [m.id]: "saved" }));
      return;
    }

    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(m.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "message" in data && typeof data.message === "string"
            ? data.message
            : t("saveFailed");
        setErrors((prev) => ({ ...prev, [m.id]: msg }));
        setStatus((prev) => ({ ...prev, [m.id]: "error" }));
        return;
      }
      const saved = data as AdminModel;
      setModels((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      setDrafts((prev) => ({ ...prev, [saved.id]: toDraft(saved) }));
      setStatus((prev) => ({ ...prev, [m.id]: "saved" }));
    } catch {
      setErrors((prev) => ({ ...prev, [m.id]: t("saveFailed") }));
      setStatus((prev) => ({ ...prev, [m.id]: "error" }));
    }
  }

  if (models.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="space-y-6">
      <p className="rounded-md border border-input bg-muted/30 p-3 text-sm text-muted-foreground">
        {t("immutableNote")}
      </p>

      {models.map((m) => {
        const d = drafts[m.id];
        const st = status[m.id] ?? "idle";
        return (
          <div key={m.id} className="rounded-lg border border-input p-4" data-testid={`model-${m.id}`}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-medium">{m.id}</h2>
              {/* provider 与 upstreamModel 只读：换上游会让对账把两批结果混在一起。 */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>
                  {t("providerLabel")}: <code className="text-xs">{m.provider}</code>
                </span>
                <span>
                  {t("upstreamModelLabel")}: <code className="text-xs">{m.upstreamModel}</code>
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${m.id}-name`}>{t("displayNameLabel")}</Label>
                <Input
                  id={`${m.id}-name`}
                  value={d.displayName}
                  onChange={(e) => setDraft(m.id, { displayName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${m.id}-credits`}>{t("creditsLabel")}</Label>
                <Input
                  id={`${m.id}-credits`}
                  type="number"
                  // 前端也标一道下限只是为了少一次往返；**权威校验在后端**
                  // （min 属性能被绕过，而 credits=0 会让该模型每次生成都失败）。
                  min={MIN_MODEL_CREDITS}
                  value={d.credits}
                  onChange={(e) => setDraft(m.id, { credits: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{t("creditsHelp")}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${m.id}-sort`}>{t("sortOrderLabel")}</Label>
                <Input
                  id={`${m.id}-sort`}
                  type="number"
                  value={d.sortOrder}
                  onChange={(e) => setDraft(m.id, { sortOrder: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 sm:pt-6">
                <input
                  id={`${m.id}-enabled`}
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={d.enabled}
                  onChange={(e) => setDraft(m.id, { enabled: e.target.checked })}
                />
                <Label htmlFor={`${m.id}-enabled`}>{t("enabledLabel")}</Label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={() => save(m)} disabled={st === "saving"}>
                {st === "saving" ? t("saving") : t("save")}
              </Button>
              {st === "saved" && <span className="text-sm text-success">{t("saved")}</span>}
              {st === "error" && errors[m.id] && (
                <span className="text-sm text-destructive">{errors[m.id]}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminPlan } from "@/lib/plan-model-types";

type SaveStatus = "idle" | "saving" | "saved" | "error";

/** 一个档位的可编辑字段。与 EDITABLE_PLAN_KEYS 对应，数字用字符串存以便受控输入。 */
type Draft = {
  displayName: string;
  monthlyCredits: string;
  enabled: boolean;
  sortOrder: string;
};

function toDraft(p: AdminPlan): Draft {
  return {
    displayName: p.displayName,
    monthlyCredits: String(p.monthlyCredits),
    enabled: p.enabled,
    sortOrder: String(p.sortOrder),
  };
}

/**
 * 档位配置表单。
 *
 * **每个档位一个独立的保存按钮**，而不是一个全局保存。后端每个档位是独立的
 * PATCH 端点，逐行保存与它 1:1 对应；做成全局保存则要处理"档位 A 存成功、B 失败"
 * 的部分失败状态，而那个状态没有好的表达方式——页面既不能说成功也不能说失败。
 */
export function PlansForm({ plans: initial }: { plans: AdminPlan[] }) {
  const t = useTranslations("AdminPlans");
  const [plans, setPlans] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(initial.map((p) => [p.id, toDraft(p)])),
  );
  // 每行独立的状态与错误，键是档位 id。
  const [status, setStatus] = useState<Record<string, SaveStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    // 改动后清掉上一次的"已保存"，否则会显示一个与当前输入不符的绿字。
    setStatus((prev) => ({ ...prev, [id]: "idle" }));
  }

  async function save(plan: AdminPlan) {
    const d = drafts[plan.id];
    setStatus((prev) => ({ ...prev, [plan.id]: "saving" }));
    setErrors((prev) => ({ ...prev, [plan.id]: "" }));

    // 只发改动过的字段：后端按"传了才改"处理，全量发会把并发的另一处修改覆盖掉。
    const updates: Record<string, unknown> = {};
    if (d.displayName !== plan.displayName) updates.displayName = d.displayName;
    if (d.enabled !== plan.enabled) updates.enabled = d.enabled;
    if (Number(d.monthlyCredits) !== plan.monthlyCredits) {
      updates.monthlyCredits = Number(d.monthlyCredits);
    }
    if (Number(d.sortOrder) !== plan.sortOrder) updates.sortOrder = Number(d.sortOrder);

    if (Object.keys(updates).length === 0) {
      setStatus((prev) => ({ ...prev, [plan.id]: "saved" }));
      return;
    }

    try {
      const res = await fetch(`/api/admin/plans/${encodeURIComponent(plan.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        // 后台是本仓唯一直出后端 message 的地方：受众是管理员，而后端的校验信息
        // （"credits 必须 ≥ 1"、"价格不可改"）正是他诊断问题需要的。
        const msg =
          data && typeof data === "object" && "message" in data && typeof data.message === "string"
            ? data.message
            : t("saveFailed");
        setErrors((prev) => ({ ...prev, [plan.id]: msg }));
        setStatus((prev) => ({ ...prev, [plan.id]: "error" }));
        return;
      }
      // 用服务端返回的那份刷新，而不是本地拼——避免"以为改了但没落库"。
      const saved = data as AdminPlan;
      setPlans((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      setDrafts((prev) => ({ ...prev, [saved.id]: toDraft(saved) }));
      setStatus((prev) => ({ ...prev, [plan.id]: "saved" }));
    } catch {
      setErrors((prev) => ({ ...prev, [plan.id]: t("saveFailed") }));
      setStatus((prev) => ({ ...prev, [plan.id]: "error" }));
    }
  }

  if (plans.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="space-y-6">
      {/*
        不可变字段的说明。**不能只是把输入框藏起来**——那样运营会以为是漏做了功能，
        然后去数据库里直接改，而那正是最坏的结果（Stripe 与库里的价格从此对不上，
        表现为"用户按旧价付款、系统按新价发额度"）。
      */}
      <p className="rounded-md border border-input bg-muted/30 p-3 text-sm text-muted-foreground">
        {t("immutableNote")}
      </p>

      {plans.map((plan) => {
        const d = drafts[plan.id];
        const st = status[plan.id] ?? "idle";
        return (
          <div key={plan.id} className="rounded-lg border border-input p-4" data-testid={`plan-${plan.id}`}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-medium">{plan.id}</h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {/* 价格与 Price ID 只读展示，不给输入框。 */}
                <span>
                  {t("priceLabel")}: ${(plan.priceUsdCents / 100).toFixed(2)}
                </span>
                <span data-testid={`plan-${plan.id}-stripe`}>
                  {t("stripePriceLabel")}:{" "}
                  {plan.stripePriceID ? (
                    <code className="text-xs">{plan.stripePriceID}</code>
                  ) : (
                    // 空的 Price ID 是运营确认"seed-stripe 跑过没有"的唯一线索，
                    // 用醒目颜色标出来——订阅接口找不到 Price 会直接失败。
                    <span className="text-destructive">{t("notSeeded")}</span>
                  )}
                </span>
              </div>
            </div>

            {/* 手机单列、桌面双列。sm 起分栏而不是 md：这些输入框都很窄。 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${plan.id}-name`}>{t("displayNameLabel")}</Label>
                <Input
                  id={`${plan.id}-name`}
                  value={d.displayName}
                  onChange={(e) => setDraft(plan.id, { displayName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${plan.id}-credits`}>{t("monthlyCreditsLabel")}</Label>
                <Input
                  id={`${plan.id}-credits`}
                  type="number"
                  min={0}
                  value={d.monthlyCredits}
                  onChange={(e) => setDraft(plan.id, { monthlyCredits: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${plan.id}-sort`}>{t("sortOrderLabel")}</Label>
                <Input
                  id={`${plan.id}-sort`}
                  type="number"
                  value={d.sortOrder}
                  onChange={(e) => setDraft(plan.id, { sortOrder: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 sm:pt-6">
                {/* 原生 checkbox：仓库没有 Switch 组件，且原生控件的 ARIA 天生正确。 */}
                <input
                  id={`${plan.id}-enabled`}
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={d.enabled}
                  onChange={(e) => setDraft(plan.id, { enabled: e.target.checked })}
                />
                <Label htmlFor={`${plan.id}-enabled`}>{t("enabledLabel")}</Label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={() => save(plan)} disabled={st === "saving"}>
                {st === "saving" ? t("saving") : t("save")}
              </Button>
              {st === "saved" && <span className="text-sm text-success">{t("saved")}</span>}
              {st === "error" && errors[plan.id] && (
                <span className="text-sm text-destructive">{errors[plan.id]}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

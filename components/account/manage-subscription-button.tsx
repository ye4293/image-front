"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { billingErrorKey } from "@/lib/billing-errors";
import { Button } from "@/components/ui/button";

/**
 * "管理订阅"：调 `/api/billing/portal` 拿一次性链接，然后整页跳到 Stripe 的账单中心
 * （换卡 / 取消 / 看发票）。
 *
 * 为什么不做成一个 `<Link href="/api/billing/portal">`：那条路由是 POST（创建会话是
 * 有副作用的，见该文件注释），链接发不出 POST；而且拿不到失败时的可读文案。
 */
export function ManageSubscriptionButton() {
  const t = useTranslations("Account");
  const tb = useTranslations("Billing");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });

      if (res.status === 401) {
        // 页面渲染时还有 token，此刻没了（过期 / 别的标签页登出）。回登录页，登录完
        // 回到账户页。
        router.push({ pathname: "/login", query: { next: "/account" } });
        return;
      }

      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const code =
          typeof body === "object" &&
          body !== null &&
          typeof (body as { code?: unknown }).code === "number"
            ? (body as { code: number }).code
            : 0;
        // "portal" 这个 surface 参数是必需的：40001 在这条接口上是"还没有账单账户"，
        // 在 /generations 上是"次数不足"。见 lib/billing-errors.ts。
        setError(tb(billingErrorKey(code, "portal")));
        setPending(false);
        return;
      }

      const body: unknown = await res.json().catch(() => null);
      const url =
        typeof body === "object" &&
        body !== null &&
        typeof (body as { portalUrl?: unknown }).portalUrl === "string"
          ? (body as { portalUrl: string }).portalUrl
          : null;
      if (!url) {
        setError(tb("genericError"));
        setPending(false);
        return;
      }
      // Stripe 域名，必须整页跳转。**不复位 pending**：跳转在路上，放开按钮只会让人
      // 再点一次、多开一个 Portal 会话。
      window.location.assign(url);
    } catch {
      // **必须有 catch**：fetch 的 reject 逃出事件处理器后既不会显示、也进不了
      // error.tsx，用户只看到按钮闪一下就复原。本仓库在 AuthForm 上真出过这个 bug。
      setError(tb("networkError"));
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        data-testid="manage-subscription"
        onClick={openPortal}
        disabled={pending}
      >
        {pending ? t("openingPortal") : t("manageSubscription")}
      </Button>
      {error && (
        <p role="alert" data-testid="portal-error" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

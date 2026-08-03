"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const t = useTranslations("Account");
  // 用 i18n/navigation 的 useRouter：`replace("/")` 在中文界面下要落到 `/zh`，
  // 用 next/navigation 的会把用户甩回英文首页。
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onLogout() {
    setError(null);
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      // 与 AuthForm 同理：导航派发后不复位 pending，避免 RSC 请求在途时按钮
      // 重新可点。
      router.replace("/");
      router.refresh();
    } catch {
      // 不接住的话是一条静默的 unhandled rejection：用户点了登出，页面毫无反应、
      // 没有任何提示，而 cookie 其实还在。
      setError(t("signOutError"));
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={onLogout}
      >
        {pending ? t("signingOut") : t("signOut")}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

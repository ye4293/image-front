"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
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
      setError("Couldn't sign out. Please try again.");
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
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

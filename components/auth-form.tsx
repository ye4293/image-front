"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "login" | "register";

const COPY: Record<Mode, { title: string; submit: string; altText: string; altHref: string; altLabel: string }> = {
  login: {
    title: "Sign in",
    submit: "Sign in",
    altText: "No account yet?",
    altHref: "/register",
    altLabel: "Create one",
  },
  register: {
    title: "Create account",
    submit: "Create account",
    altText: "Already registered?",
    altHref: "/login",
    altLabel: "Sign in",
  },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? "Something went wrong");
        setPending(false);
        return;
      }
      // 成功后**不**复位 pending：push/refresh 只是把导航派发出去，目标路由的 RSC
      // 请求还在飞。此时若把按钮重新启用，用户可以再次提交——注册路径上第二次 POST
      // 会拿到 409，于是一次*成功*的注册反而闪出一条红色报错。让按钮保持禁用，直到
      // 导航把这个组件卸载掉。
      if (mode === "register") {
        router.replace("/login?registered=1");
      } else {
        router.replace("/account");
      }
      router.refresh();
    } catch {
      // fetch 只在网络层失败时 reject（离线、DNS 失败、服务端中途重启、请求被 abort）。
      // 不接住的话，rejection 会从事件处理器里逃逸成 unhandled rejection——React 不会
      // 显示它，error.tsx 也接不到，用户只看见按钮闪一下就恢复原样，与没点过完全一样。
      // 不展示原始错误文本，避免把内部细节透给用户。
      setError("Network error. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={8}
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {mode === "register" && (
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Please wait…" : copy.submit}
      </Button>

      <p className="text-sm text-muted-foreground">
        {copy.altText}{" "}
        <Link href={copy.altHref} className="underline">
          {copy.altLabel}
        </Link>
      </p>
    </form>
  );
}

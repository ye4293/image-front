"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeNextPath } from "@/lib/safe-next";

type Mode = "login" | "register";

/**
 * `next`：登录成功后要回到的站内路径，来自 `/login?next=…`。定价页在未登录用户点
 * "选择 Pro"时会带上 `next=/pricing`，让人登录完能接着结账，而不是被丢到账户页
 * 自己找回去。
 *
 * 注册模式忽略它：后端不在注册时签发 token，注册后必须先登录，中间多一跳；把 next
 * 一路串下去的收益不值那份复杂度。
 *
 * **一定要过 `safeNextPath`**：这个值来自 URL，直接拿去导航就是开放重定向。
 */
export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const t = useTranslations("Auth");
  // 文案键按模式前缀拼出来，而不是维护一张 Record<Mode, {...}>：词条已经是
  // 扁平的键值表，再套一层映射只是把同一份数据抄第二遍。
  const copy = {
    title: t(`${mode}Title`),
    submit: t(`${mode}Submit`),
    altText: t(`${mode}AltText`),
    altLabel: t(`${mode}AltLabel`),
    altHref: mode === "login" ? "/register" : "/login",
  } as const;

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
        // 已知缺口：`body.message` 是后端原样返回的英文句子（"email already
        // registered"、"invalid email or password"），无论界面语言是什么都照原样
        // 显示。**不要**在这里做字符串匹配翻译——那等于把前端文案和后端措辞绑死，
        // 后端改一个词就静默退化成英文。正解是后端返回稳定的错误码，前端按码查词条。
        setError(body?.message ?? t("genericError"));
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
        // 校验后的 next 优先；非法或缺失时回落到账户页（既有行为）。
        router.replace(safeNextPath(next) ?? "/account");
      }
      router.refresh();
    } catch {
      // fetch 只在网络层失败时 reject（离线、DNS 失败、服务端中途重启、请求被 abort）。
      // 不接住的话，rejection 会从事件处理器里逃逸成 unhandled rejection——React 不会
      // 显示它，error.tsx 也接不到，用户只看见按钮闪一下就恢复原样，与没点过完全一样。
      // 不展示原始错误文本，避免把内部细节透给用户。
      setError(t("networkError"));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>

      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
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
        <Label htmlFor="password">{t("password")}</Label>
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
          <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("pending") : copy.submit}
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

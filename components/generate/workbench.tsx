"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ParamPanel } from "@/components/generate/param-panel";
import { ResultPanel } from "@/components/generate/result-panel";
import { InsufficientCreditsDialog } from "@/components/generate/insufficient-credits-dialog";
import type { CreditBalance, Generation, ImageModel } from "@/lib/generation-types";

const ERR_INSUFFICIENT_CREDITS = 40001;
/** 覆盖最慢模型（约 3 分钟）并留余量。 */
const CLIENT_TIMEOUT_MS = 240_000;

export function Workbench({
  models,
  initialBalance,
}: {
  models: readonly ImageModel[];
  initialBalance: CreditBalance;
}) {
  const t = useTranslations("Generate");
  // 这里刻意用 next/navigation 的 useRouter 而不是 i18n/navigation 的：本组件只调
  // `router.refresh()`（刷新当前路由的 RSC），不做任何跳转，没有语言前缀问题。
  const router = useRouter();
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [prompt, setPrompt] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [pending, setPending] = useState(false);
  const [current, setCurrent] = useState<Generation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Extract<Generation, { status: "succeeded" }>[]>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [balance, setBalance] = useState<CreditBalance>(initialBalance);

  async function refreshBalance() {
    try {
      const res = await fetch("/api/credits");
      if (res.ok) setBalance(await res.json());
    } catch {
      // 余额刷新失败不影响主流程，静默即可——顶栏会在下次导航时同步。
    }
    // 顶栏余额是 Server Component 渲染的，需要 refresh 才会更新。
    router.refresh();
  }

  async function onSubmit() {
    setError(null);
    setCurrent(null);
    setPending(true);
    try {
      const res = await fetch("/api/generations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, model: modelId, aspectRatio, isPublic }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (body?.code === ERR_INSUFFICIENT_CREDITS) {
          setShowUpgrade(true);
        } else {
          // 同 auth-form：`body.message` 是后端的英文原文，不随界面语言变。
          // 真后端必须返回错误码，前端才能查词条翻译。见 §已知缺口。
          setError(body?.message ?? t("genericError"));
        }
        return;
      }

      const generation: Generation = await res.json();
      if (generation.status === "failed") {
        const model = models.find((m) => m.id === generation.model);
        // generation.error 同样是上游原文，只能原样嵌进本地化句式里。
        setError(t("failed", { error: generation.error, credits: model?.credits ?? 0 }));
      } else {
        setCurrent(generation);
        setRecent((r) => [generation, ...r].slice(0, 8));
      }
      await refreshBalance();
    } catch (e) {
      // fetch 只在网络层失败时 reject。不接住就是一条静默的 unhandled rejection：
      // 按钮闪一下恢复原样，用户完全看不出发生了什么（M1 登录表单踩过这个坑）。
      //
      // 超时文案**不能**说"次数未被扣除"：客户端 abort 时服务端的扣费早已提交，
      // 而 Handler 的 `sleep` 刻意不理 `req.signal`（那是对的——见设计 §2.2 风险一：
      // 真后端必须用脱离请求的 context），所以服务端会一路跑到成功且永不退款。
      // 次数确实被扣了。在 mock 里这条不可达（最长 90 秒 < 240 秒超时），但真后端
      // 最慢约 3 分钟、加上网络开销会越过 240 秒。这也是 §9 里 `/history` 优先级
      // 上升的直接原因——它是用户"确认这次到底扣没扣、图去哪了"的唯一途径。
      const timedOut = e instanceof DOMException && e.name === "TimeoutError";
      setError(timedOut ? t("timeout") : t("networkError"));
    } finally {
      // 这里与认证表单不同：生成完成后**留在原页**，组件不会被卸载，
      // 所以必须复位 pending，否则按钮永久禁用。
      setPending(false);
    }
  }

  return (
    <>
      {/*
        用 flex-1 撑满 <main> 的剩余高度，**不要**写回 min-h-[calc(100vh-57px)]。
        那个 57px 是硬编码的顶栏高度，实际顶栏约 65px，于是容器比视口高，
        底部锚定的 prompt 与生成按钮被挤到折叠线以下——用户必须滚动才能点到
        主界面上最重要的按钮。链路是 html.h-full → body.min-h-full.flex-col
        → main.flex-1.flex-col → 这里 flex-1，全程没有魔法数字。
      */}
      <div className="flex flex-1">
        <ParamPanel
          models={models}
          modelId={modelId}
          onModelChange={setModelId}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={onSubmit}
          pending={pending}
          isPublic={isPublic}
          onIsPublicChange={setIsPublic}
        />
        <ResultPanel pending={pending} current={current} error={error} recent={recent} />
      </div>
      <InsufficientCreditsDialog
        open={showUpgrade}
        balance={balance}
        onClose={() => setShowUpgrade(false)}
      />
    </>
  );
}

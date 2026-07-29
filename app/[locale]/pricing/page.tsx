import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listPlans } from "@/lib/backend";
import { getToken } from "@/lib/session";
import { PlanCards } from "@/components/pricing/plan-cards";
import { CreditExplainer } from "@/components/pricing/credit-explainer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("pricingTitle") };
}

/**
 * 定价页。**未登录也必须能看**（这是获客页），所以档位走后端的公开接口。
 *
 * 这里直接调 `listPlans()` 而不是 fetch 自己的 `/api/plans`：本页是 Server
 * Component，自 fetch 自己的 Route Handler 要拼绝对 URL（`VERCEL_URL`/`HOST` 每个环境
 * 一套写法）、多绕一跳网络，换不到任何东西。`/api/plans` 留给客户端调用方。
 */
export default async function PricingPage() {
  const t = await getTranslations("Pricing");
  // 登录态只用来决定按钮点下去是"结账"还是"先去登录"。**不做重定向**：未登录访客
  // 本来就该看得到价格。
  const signedIn = Boolean(await getToken());
  const res = await listPlans();

  return (
    <div>
      <div className="px-6 py-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {res.ok ? (
        <PlanCards plans={res.data.plans} signedIn={signedIn} />
      ) : (
        // 后端连不上或自己坏了。这里**不 throw**：throw 会把整页换成 error.tsx，
        // 连下面那段"月度 vs 加量包"的说明一起弄没——而那段不依赖后端，本来还能看。
        //
        // 也不展示 `res.error.message`：本页直接调 lib/backend.ts，没经过 BFF 路由，
        // 那套"把后端消息换成通用文案"的映射在这条路径上不生效，原文会直接漏给访客。
        <p
          data-testid="plans-unavailable"
          className="px-6 pb-8 text-center text-sm text-muted-foreground"
        >
          {t("plansUnavailable")}
        </p>
      )}

      <CreditExplainer />
    </div>
  );
}

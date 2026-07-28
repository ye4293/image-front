import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { fetchMe, listModels } from "@/lib/backend";
import { getToken } from "@/lib/session";
import { redirect } from "@/i18n/navigation";
import { Workbench } from "@/components/generate/workbench";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("generateTitle") };
}

export default async function GeneratePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // 用 next-intl 的 redirect 而非 next/navigation 的：后者会把中文用户甩到英文
  // `/login`，语言选择在一次跳转里悄悄丢掉（同 account/page.tsx）。
  const token = await getToken();
  if (!token) redirect({ href: "/login", locale });

  // 服务端直接取，首屏无加载闪烁。两个请求互不依赖，所以并发发出——串起来的话
  // 首屏要多等一整个往返，而这是登录后最常访问的页面。
  const [modelsRes, meRes] = await Promise.all([listModels(), fetchMe(token)]);

  // 401 = token 无效/过期，唯一出路是重新登录。这是 proxy 只查 cookie 存在性之后的兜底。
  if (!meRes.ok && meRes.status === 401) redirect({ href: "/login", locale });

  // 后端不可用时退化成空模型列表 + 零余额，让页面仍能渲染出来。**刻意不 throw**：
  // throw 在生产里就是一张纯白的 500 页（同 account/page.tsx 的取舍）。用户会看到
  // 一个点不动的界面，但看得见顶栏、能去别的页面。
  const models = modelsRes.ok ? modelsRes.data.models : [];
  const balance = meRes.ok ? meRes.data.credits : { monthly: 0, addon: 0 };
  return <Workbench models={models} initialBalance={balance} />;
}

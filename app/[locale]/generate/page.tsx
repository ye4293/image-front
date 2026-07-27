import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MODELS, getBalance } from "@/lib/fixtures";
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

export default async function GeneratePage() {
  // 服务端直接读 fixtures，首屏无加载闪烁。接真后端时这里改成 lib/backend.ts 调用
  // （届时会变成真正的 await，所以现在就保留 async 签名，避免那次改动牵连函数签名）。
  const models = MODELS;
  const balance = getBalance();
  return <Workbench models={models} initialBalance={balance} />;
}

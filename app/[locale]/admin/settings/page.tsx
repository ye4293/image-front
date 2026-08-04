import { getTranslations } from "next-intl/server";
import { fetchAdminSettings } from "@/lib/backend";
import { getToken } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "@/components/settings-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("adminSettingsTitle") };
}

/**
 * 后台设置页。
 *
 * **鉴权已上移到 app/[locale]/admin/layout.tsx**，这里不再重复检查 token 与 role。
 * 原先每个后台页面各抄一遍那段逻辑，四个页面就是四份，漏一个就是信息泄露洞。
 *
 * 容器宽度也由 layout 提供（max-w-6xl px-4 py-8），这里只管内容——再套一层
 * max-w-2xl py-16 会双倍留白。
 */
export default async function AdminSettingsPage() {
  const token = await getToken();
  // layout 已确认 token 存在且是管理员，走到这里不会为空。但类型上它是
  // string | undefined，仍要收窄——不用 ! 断言，那会让"layout 哪天被改动"从一个
  // 编译错误退化成运行时崩溃。
  if (!token) return null;

  const t = await getTranslations("AdminSettings");
  const settingsRes = await fetchAdminSettings(token);

  if (!settingsRes.ok) {
    // 走到这里说明是基础设施故障（403 不可能：layout 刚确认过是管理员）。
    // 真实错误由 toClientError 记在服务端日志里，页面只给一句通用提示。
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{t("saveFailed")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>
            {/* CardTitle 在 shadcn v4 里渲染成 <div>，标题语义要自己补 <h1>。 */}
            <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          <SettingsForm settings={settingsRes.data} />
        </CardContent>
      </Card>
    </div>
  );
}

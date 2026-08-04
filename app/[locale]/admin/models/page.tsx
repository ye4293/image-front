import { getTranslations } from "next-intl/server";
import { fetchAdminModels } from "@/lib/backend";
import { getToken } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ModelsForm } from "@/components/admin/models-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("adminModelsTitle") };
}

/** 鉴权与容器由 app/[locale]/admin/layout.tsx 提供，这里只管内容。 */
export default async function AdminModelsPage() {
  const token = await getToken();
  if (!token) return null;

  const t = await getTranslations("AdminModels");
  const res = await fetchAdminModels(token);

  if (!res.ok) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{t("loadFailed")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        <ModelsForm models={res.data} />
      </CardContent>
    </Card>
  );
}

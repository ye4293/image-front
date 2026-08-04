import { getTranslations } from "next-intl/server";
import { fetchAdminUsers } from "@/lib/backend";
import { getToken } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UsersTable } from "@/components/admin/users-table";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("adminUsersTitle") };
}

/** 鉴权与容器由 app/[locale]/admin/layout.tsx 提供，这里只管内容。 */
export default async function AdminUsersPage() {
  const token = await getToken();
  if (!token) return null;

  const t = await getTranslations("AdminUsers");
  const res = await fetchAdminUsers(token, { limit: 20 });

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
        <UsersTable initial={res.data} />
      </CardContent>
    </Card>
  );
}

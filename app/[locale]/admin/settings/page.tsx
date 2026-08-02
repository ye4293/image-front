import { getTranslations } from "next-intl/server";
import { fetchAdminSettings, fetchMe } from "@/lib/backend";
import { getToken } from "@/lib/session";
import { redirect } from "@/i18n/navigation";
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

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Same pattern as account/page.tsx: getToken() first, redirect to /login if absent.
  const token = await getToken();
  if (!token) redirect({ href: "/login", locale });

  // Validate admin role. proxy.ts only checks that a cookie exists — a signed-in
  // non-admin can navigate directly to /admin/settings. Fetching /me here and
  // checking role === "admin" ensures non-admin users cannot see the form, the
  // masks, or the configured-state indicators. Showing that information to a
  // regular user is information disclosure.
  const meRes = await fetchMe(token);

  // 401 = token invalid/expired.
  if (!meRes.ok && meRes.status === 401) redirect({ href: "/login", locale });

  const t = await getTranslations("AdminSettings");

  // Non-admin: show forbidden message without rendering the form or any settings data.
  if (!meRes.ok || meRes.data.role !== "admin") {
    return (
      <div className="mx-auto w-full max-w-2xl py-16">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("forbidden")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Admin confirmed — now fetch the settings.
  const settingsRes = await fetchAdminSettings(token);

  if (!settingsRes.ok) {
    // Not a 403 (we just confirmed admin) so this is an infrastructure error.
    // Show a generic message; the real error is logged server-side by toClientError.
    return (
      <div className="mx-auto w-full max-w-2xl py-16">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("saveFailed")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl py-16">
      <Card>
        <CardHeader>
          <CardTitle>
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

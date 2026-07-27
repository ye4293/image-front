import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const { registered } = await searchParams;
  const t = await getTranslations("Auth");
  return (
    <div className="mx-auto w-full max-w-sm py-16">
      {registered && (
        <p className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
          {t("registeredNotice")}
        </p>
      )}
      <AuthForm mode="login" />
    </div>
  );
}

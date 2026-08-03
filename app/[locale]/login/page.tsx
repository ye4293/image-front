import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; next?: string }>;
}) {
  const { registered, next } = await searchParams;
  const t = await getTranslations("Auth");
  return (
    <div className="mx-auto w-full max-w-sm py-16">
      {registered && (
        <p className="mb-4 rounded-md bg-success-tint p-3 text-sm text-success">
          {t("registeredNotice")}
        </p>
      )}
      {/* next 原样传给表单，由它统一过 safeNextPath 校验——校验要贴着**执行导航的那
          一处**，两边各校一遍的话，将来漏掉的总是离导航远的那处。 */}
      <AuthForm mode="login" next={next} />
    </div>
  );
}

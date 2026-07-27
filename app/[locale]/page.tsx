import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  const t = useTranslations("Home");
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center">
      <h1 className="text-balance text-5xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
        {t("subtitle")}
      </p>
      {/* 同 site-header：用 buttonVariants 而非 <Button render={<Link/>}>，
          避免 Base UI 强制加 role="button" 把导航链接伪装成按钮。 */}
      <div className="mt-10 flex justify-center gap-3">
        <Link href="/register" className={buttonVariants({ size: "lg" })}>
          {t("getStartedFree")}
        </Link>
        <Link
          href="/login"
          className={buttonVariants({ size: "lg", variant: "outline" })}
        >
          {t("signIn")}
        </Link>
      </div>
    </section>
  );
}

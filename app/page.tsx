import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 text-center">
      <h1 className="text-balance text-5xl font-semibold tracking-tight">
        Generate images your way
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
        Pick a model, describe what you want, and get results in seconds.
        Subscribe monthly or top up whenever you need more.
      </p>
      {/* 同 site-header：用 buttonVariants 而非 <Button render={<Link/>}>，
          避免 Base UI 强制加 role="button" 把导航链接伪装成按钮。 */}
      <div className="mt-10 flex justify-center gap-3">
        <Link href="/register" className={buttonVariants({ size: "lg" })}>
          Get started free
        </Link>
        <Link
          href="/login"
          className={buttonVariants({ size: "lg", variant: "outline" })}
        >
          Sign in
        </Link>
      </div>
    </section>
  );
}

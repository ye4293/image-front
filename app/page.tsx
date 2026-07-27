import Link from "next/link";
import { Button } from "@/components/ui/button";

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
      <div className="mt-10 flex justify-center gap-3">
        <Button size="lg" nativeButton={false} render={<Link href="/register" />}>
          Get started free
        </Button>
        <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/login" />}>
          Sign in
        </Button>
      </div>
    </section>
  );
}

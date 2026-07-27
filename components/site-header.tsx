import Link from "next/link";
import { getToken } from "@/lib/session";
import { Button } from "@/components/ui/button";

export async function SiteHeader() {
  const signedIn = Boolean(await getToken());
  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="font-semibold">
          Image Studio
        </Link>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Button variant="ghost" nativeButton={false} render={<Link href="/account" />}>
              Account
            </Button>
          ) : (
            <>
              <Button variant="ghost" nativeButton={false} render={<Link href="/login" />}>
                Sign in
              </Button>
              <Button nativeButton={false} render={<Link href="/register" />}>
                Get started
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

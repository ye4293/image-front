import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const { registered } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-sm py-16">
      {registered && (
        <p className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
          Account created. Please sign in.
        </p>
      )}
      <AuthForm mode="login" />
    </div>
  );
}

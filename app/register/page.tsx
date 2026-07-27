import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <div className="mx-auto w-full max-w-sm py-16">
      <AuthForm mode="register" />
    </div>
  );
}

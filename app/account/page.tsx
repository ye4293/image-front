import { redirect } from "next/navigation";
import { fetchMe } from "@/lib/backend";
import { getToken } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/components/logout-button";

export default async function AccountPage() {
  const token = await getToken();
  if (!token) redirect("/login");

  const res = await fetchMe(token);
  if (!res.ok) {
    if (res.status === 401) redirect("/login");
    throw new Error(`backend error ${res.status}: ${res.error.message}`);
  }

  const user = res.data;
  return (
    <div className="mx-auto w-full max-w-md py-16">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Row label="User ID" value={String(user.id)} />
          <Row label="Email" value={user.email} />
          <Row label="Role" value={user.role} />
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span data-testid={`account-${label.toLowerCase().replace(" ", "-")}`} className="font-medium">
        {value}
      </span>
    </div>
  );
}

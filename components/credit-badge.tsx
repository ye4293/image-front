import Link from "next/link";
import { getBalance } from "@/lib/fixtures";

/**
 * 余额常驻顶栏右上角。调研中 Freepik、Recraft 都放在右上；Adobe Firefly 把余额
 * 藏进头像菜单，因此招致用户投诉——明确不效仿。
 */
export async function CreditBadge() {
  const { monthly, addon } = getBalance();
  const total = monthly + addon;
  return (
    <Link
      href="/pricing"
      data-testid="credit-badge"
      title={`月度 ${monthly} 次 + 加量包 ${addon} 次`}
      className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground hover:bg-muted"
    >
      ◆ {total} 次
    </Link>
  );
}

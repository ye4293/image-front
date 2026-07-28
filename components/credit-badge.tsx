import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { fetchMe } from "@/lib/backend";
import { getToken } from "@/lib/session";

/**
 * 余额常驻顶栏右上角。调研中 Freepik、Recraft 都放在右上；Adobe Firefly 把余额
 * 藏进头像菜单，因此招致用户投诉——明确不效仿。
 *
 * 数据来自后端 `/me`（余额并在里面，后端没有独立的余额接口）。顶栏只在已登录时
 * 渲染本组件（site-header.tsx），但这里仍自己取一次 token：组件不该依赖调用方
 * 替它做完认证判断，那种约定一旦被复用到别处就是一次 `token!` 崩溃。
 *
 * 取不到余额（未登录、token 过期、后端挂了）时**不渲染徽标**，而不是显示 0：
 * 显示 0 会让用户以为次数用完了、跑去买加量包。徽标消失是"暂时不知道"的诚实表达。
 */
export async function CreditBadge() {
  const token = await getToken();
  if (!token) return null;
  const res = await fetchMe(token);
  if (!res.ok) return null;

  const { monthly, addon } = res.data.credits;
  const total = monthly + addon;
  const t = await getTranslations("CreditBadge");
  return (
    <Link
      href="/pricing"
      data-testid="credit-badge"
      title={t("tooltip", { monthly, addon })}
      className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground hover:bg-muted"
    >
      {t("label", { count: total })}
    </Link>
  );
}

import { getFormatter, getTranslations } from "next-intl/server";
import { type Subscription, isSubscriptionStatus } from "@/lib/generation-types";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { ManageSubscriptionButton } from "@/components/account/manage-subscription-button";

/**
 * 把后端的 RFC3339 时间戳变成可展示的 Date，**不可用时返回 null**。
 *
 * 为什么要这道检查：`currentPeriodEnd` 只在 Stripe 真的告诉我们周期结束时间之后才有
 * 意义。Go 的 `time.Time` 零值序列化成 `"0001-01-01T00:00:00Z"`，`new Date()` 会
 * 老老实实解析成公元 1 年——直接渲染出去就是"续费日期：公元1年1月1日"。把它当成
 * "未知"处理，比显示一个荒谬的日期好。
 */
function usableDate(iso: string): Date | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() < 2000) return null;
  return date;
}

/**
 * 账户页的订阅区块。
 *
 * `subscription` 为 null（未订阅）与非 null 是**两种完全不同的界面**，不是同一块
 * UI 的空状态：前者要给的是"去看套餐"的入口，后者要给的是状态、日期和账单中心。
 */
export async function SubscriptionCard({
  subscription,
  planName,
}: {
  subscription: Subscription | null;
  /** 档位显示名。`/me` 只回 planId，名字要用 `/plans` 的结果查（查不到时回落成 id）。 */
  planName: string;
}) {
  const t = await getTranslations("Account");

  if (subscription === null) {
    return (
      <div data-testid="subscription-none" className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-medium">{t("noSubscription")}</p>
        <p className="text-xs text-muted-foreground">{t("noSubscriptionHint")}</p>
        {/* 用 buttonVariants 给 Link 上样式，而不是 Button + asChild：本项目的 shadcn
            基于 @base-ui/react，没有 asChild；而 Button render={<Link/>} 会把链接播报
            成按钮（见 site-header.tsx 的注释）。 */}
        <Link href="/pricing" className={buttonVariants({ variant: "default" })}>
          {t("viewPlans")}
        </Link>
      </div>
    );
  }

  const format = await getFormatter();
  const periodEnd = usableDate(subscription.currentPeriodEnd);
  const periodEndText = periodEnd
    ? format.dateTime(periodEnd, { dateStyle: "long" })
    : t("dateUnknown");

  // 未知状态（Stripe 还有 trialing / unpaid / paused…）不显示成空白，也不假装成
  // "已失效"——原样把状态词露出来，起码用户和客服能对上话。
  const statusLabel = isSubscriptionStatus(subscription.status)
    ? t(`status_${subscription.status}`)
    : t("status_unknown", { status: subscription.status });

  return (
    <div data-testid="subscription-active" className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{t("plan")}</span>
        <span data-testid="subscription-plan" className="font-medium">
          {planName}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{t("status")}</span>
        <span data-testid="subscription-status" className="font-medium">
          {statusLabel}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        {/* 同一个日期，两种含义：会续费时它是"下次扣款日"，已约定取消时它是"服务
            到期日"。用同一句"续费日期"会让打算取消的用户以为自己没取消成功。 */}
        <span className="text-muted-foreground">
          {subscription.cancelAtPeriodEnd ? t("endsOn") : t("renewsOn")}
        </span>
        <span data-testid="subscription-period-end" className="font-medium">
          {periodEndText}
        </span>
      </div>

      {subscription.cancelAtPeriodEnd && (
        <p
          data-testid="subscription-cancel-notice"
          className="rounded-md border border-warning/30 bg-warning-tint p-3 text-xs text-warning"
        >
          {t("cancelNotice", { date: periodEndText })}
        </p>
      )}

      {/* past_due = 最近一次扣款失败，Stripe 还在重试。**次数没被清零**（后端只在
          订阅真正 canceled 时才清），所以这里绝不能显示成"已失效"——那会让一个只是
          信用卡过期的付费用户以为自己被停了服务，第一反应是投诉而不是换卡。 */}
      {subscription.status === "past_due" && (
        <p
          data-testid="subscription-past-due-notice"
          className="rounded-md border border-danger/30 bg-danger-tint p-3 text-xs text-danger"
        >
          {t("pastDueNotice")}
        </p>
      )}

      {subscription.status === "canceled" && (
        <p
          data-testid="subscription-canceled-notice"
          className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground"
        >
          {t("canceledNotice")}
        </p>
      )}

      {/* incomplete = 首次付款还没完成（典型是 3DS 验证没走完）。此时**还没有**发次数，
          必须说清楚，否则用户会以为已经订上了、然后发现没次数。 */}
      {subscription.status === "incomplete" && (
        <p
          data-testid="subscription-incomplete-notice"
          className="rounded-md border border-warning/30 bg-warning-tint p-3 text-xs text-warning"
        >
          {t("incompleteNotice")}
        </p>
      )}

      <ManageSubscriptionButton />

      {/* 已取消的用户要的是"重新订阅"，Portal 给不了这个（那里只能看历史发票）。 */}
      {subscription.status === "canceled" && (
        <Link
          href="/pricing"
          className={buttonVariants({ variant: "ghost", className: "w-full" })}
        >
          {t("viewPlans")}
        </Link>
      )}
    </div>
  );
}

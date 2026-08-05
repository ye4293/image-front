"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminUser } from "@/lib/user-types";
import { USER_ROLES, USER_STATUSES } from "@/lib/user-types";

/** 待确认的危险操作。仓库没有 Dialog 组件，用 inline 二次确认（同 settings-form）。 */
type Pending =
  | { kind: null }
  | { kind: "ban" | "unban" | "promote" | "demote"; userId: number };

type Props = {
  initial: { users: AdminUser[]; nextCursor: string | null };
};

/**
 * 用户列表 + 搜索/过滤 + 封禁/角色 + 发额度。
 *
 * **双形态渲染**：手机上每个用户一张卡片（label/value 左右对齐，同 account 页的 Row），
 * `md:` 以上切成真表格。仓库的 components/ui/ 里没有 table，而单个表格加
 * overflow-x-auto 在 375 宽下要横向拖才能看到操作列——那是最需要点的一列。
 *
 * 分页用「加载更多」按钮而不是无限滚动，理由见 history-grid 的注释。
 */
export function UsersTable({ initial }: Props) {
  const t = useTranslations("AdminUsers");
  const [users, setUsers] = useState(initial.users);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState(false);

  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  /**
   * applied 是**当前列表实际对应的**那组过滤条件，与上面三个"输入框里的值"分开。
   *
   * 分开是因为游标只在发它的那组条件下有意义。合起来用的话：管理员在搜索框里
   * 打了新关键词但**还没点搜索**，然后点"加载更多"——请求会带着旧条件下发出的
   * 游标 + 新的关键词，后端于是从旧列表的某个位置开始、按新条件往下翻。结果是
   * 一页跳过去的用户既不属于旧列表也不属于新列表，而界面上看不出发生过这件事。
   * 这与后端选游标分页而不是 offset 的理由是同一条：这个列表决定封谁，漏看
   * 意味着漏掉一个该处理的账号。
   */
  const [applied, setApplied] = useState({ q: "", role: "", status: "" });

  const [pending, setPending] = useState<Pending>({ kind: null });
  const [rowError, setRowError] = useState<Record<number, string>>({});

  function queryString(
    filters: { q: string; role: string; status: string },
    extra: Record<string, string> = {},
  ) {
    const p = new URLSearchParams();
    if (filters.q.trim()) p.set("q", filters.q.trim());
    if (filters.role) p.set("role", filters.role);
    if (filters.status) p.set("status", filters.status);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  }

  /** 按给定条件查第一页并替换列表。search 与 reload 共用。 */
  async function runQuery(filters: { q: string; role: string; status: string }) {
    setLoading(true);
    setListError(false);
    try {
      const res = await fetch(`/api/admin/users?${queryString(filters)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as { users: AdminUser[]; nextCursor: string | null };
      setUsers(page.users);
      setCursor(page.nextCursor);
      setApplied(filters);
    } catch {
      // 列表加载失败走本地化通用文案，不显示后端原文：那些是英文运维文案，
      // 四语界面都会露出英文（与 history-grid 同一判断）。
      setListError(true);
    } finally {
      setLoading(false);
    }
  }

  /** 重新查第一页（搜索/过滤变更时）。 */
  async function search() {
    // 先把输入框里的值定格下来，后续的"加载更多"都用这一份，而不是继续读
    // 可能已经被改动的输入框（见 applied 的注释）。
    await runQuery({ q, role, status });
  }

  /**
   * 按**当前已生效**的条件重查，用于发完额度之后刷新余额。
   *
   * 不刷新的后果不只是"显示旧数字"：管理员发完看到余额没变，会以为没成功而**再发
   * 一次**，而 POST /admin/credits 没有幂等保护（见 GrantForm 的注释），于是真的加了
   * 两次。这里回到第一页是刻意的——余额变了，继续沿用旧游标往下翻本来也不对。
   */
  async function reload() {
    await runQuery(applied);
  }

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setListError(false);
    try {
      // 用 applied 而不是 q/role/status：游标只在发它的那组条件下有意义。
      const res = await fetch(`/api/admin/users?${queryString(applied, { cursor })}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const page = (await res.json()) as { users: AdminUser[]; nextCursor: string | null };
      // 函数式更新：连点两次时闭包里的 users 是旧值，直接展开会丢掉一页。
      setUsers((prev) => [...prev, ...page.users]);
      setCursor(page.nextCursor);
    } catch {
      setListError(true);
    } finally {
      setLoading(false);
    }
  }

  async function patchUser(u: AdminUser, updates: { role?: string; status?: string }) {
    setPending({ kind: null });
    setRowError((prev) => ({ ...prev, [u.id]: "" }));
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        // **这里要显示后端原文。** 两条防自锁守卫（不能改自己、不能降权最后一个
        // 管理员）的 message 说明了为什么被拒，那正是管理员需要知道的；换成通用
        // 文案会让他反复点、以为是页面坏了。
        const msg =
          data && typeof data === "object" && "message" in data && typeof data.message === "string"
            ? data.message
            : t("updateFailed");
        setRowError((prev) => ({ ...prev, [u.id]: msg }));
        return;
      }
      const saved = data as AdminUser;
      setUsers((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
    } catch {
      setRowError((prev) => ({ ...prev, [u.id]: t("updateFailed") }));
    }
  }

  /** 一行的操作按钮组。手机与桌面共用，避免两份逻辑走偏。 */
  function Actions({ u }: { u: AdminUser }) {
    const isPending = pending.kind !== null && pending.userId === u.id;
    const banning = u.status === "active";
    const promoting = u.role !== "admin";

    if (isPending) {
      const action = pending.kind;
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="xs"
            variant="destructive"
            onClick={() =>
              patchUser(
                u,
                action === "ban"
                  ? { status: "banned" }
                  : action === "unban"
                    ? { status: "active" }
                    : action === "promote"
                      ? { role: "admin" }
                      : { role: "user" },
              )
            }
          >
            {t("confirm")}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setPending({ kind: null })}>
            {t("cancel")}
          </Button>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="xs"
          variant="outline"
          data-testid={`user-${u.id}-ban`}
          onClick={() => setPending({ kind: banning ? "ban" : "unban", userId: u.id })}
        >
          {banning ? t("ban") : t("unban")}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          data-testid={`user-${u.id}-role`}
          onClick={() => setPending({ kind: promoting ? "promote" : "demote", userId: u.id })}
        >
          {promoting ? t("makeAdmin") : t("removeAdmin")}
        </Button>
      </div>
    );
  }

  function roleLabel(r: string) {
    return r === "admin" ? t("roleAdmin") : t("roleUser");
  }
  function statusLabel(s: string) {
    return s === "banned" ? t("statusBanned") : t("statusActive");
  }

  return (
    <div className="space-y-6">
      {/* 搜索与过滤。flex-wrap 让它在 375 宽下折行而不是横向溢出。 */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="user-search">{t("search")}</Label>
          <Input
            id="user-search"
            value={q}
            placeholder={t("searchPlaceholder")}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
          />
        </div>
        {/* 原生 select：仓库一律用它（移动端调系统选择器、ARIA 天生正确）。 */}
        <div className="space-y-1.5">
          <Label htmlFor="user-role">{t("filterRole")}</Label>
          <select
            id="user-role"
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">{t("all")}</option>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="user-status">{t("filterStatus")}</Label>
          <select
            id="user-status"
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">{t("all")}</option>
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" onClick={() => void search()} disabled={loading}>
          {loading ? t("loading") : t("search")}
        </Button>
      </div>

      {listError && (
        <p role="alert" className="text-sm text-destructive">
          {t("loadFailed")}
        </p>
      )}

      {users.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          {/* ── 手机：卡片列表 ── */}
          <ul className="space-y-3 md:hidden">
            {users.map((u) => (
              <li key={u.id} className="rounded-lg border border-input p-3" data-testid={`user-card-${u.id}`}>
                <p className="mb-2 font-medium break-all">{u.email}</p>
                <div className="space-y-1 text-sm">
                  <CardRow label={t("colRole")} value={roleLabel(u.role)} />
                  <CardRow label={t("colStatus")} value={statusLabel(u.status)} />
                  <CardRow
                    label={t("colCredits")}
                    value={t("creditsFormat", { monthly: u.monthlyCredits, addon: u.addonCredits })}
                  />
                </div>
                <div className="mt-3">
                  <Actions u={u} />
                </div>
                {rowError[u.id] && (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {rowError[u.id]}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {/* ── 桌面：真表格 ── */}
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-normal">{t("colEmail")}</th>
                <th className="pb-2 font-normal">{t("colRole")}</th>
                <th className="pb-2 font-normal">{t("colStatus")}</th>
                <th className="pb-2 font-normal">{t("colCredits")}</th>
                <th className="pb-2 font-normal">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b" data-testid={`user-row-${u.id}`}>
                  <td className="py-2 break-all">{u.email}</td>
                  <td className="py-2">{roleLabel(u.role)}</td>
                  <td className="py-2">{statusLabel(u.status)}</td>
                  <td className="py-2">
                    {t("creditsFormat", { monthly: u.monthlyCredits, addon: u.addonCredits })}
                  </td>
                  <td className="py-2">
                    <Actions u={u} />
                    {rowError[u.id] && (
                      <p role="alert" className="mt-1 text-destructive">
                        {rowError[u.id]}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {cursor && (
            <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loading}>
              {loading ? t("loading") : t("loadMore")}
            </Button>
          )}
        </>
      )}

      <GrantForm onGranted={() => void reload()} />
    </div>
  );
}

function CardRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

/**
 * 手工发额度。
 *
 * ⚠️ 后端的 POST /admin/credits **没有幂等保护**（流水的 ExternalID 留 nil，而 NULL
 * 之间互不相等，唯一索引拦不住），所以同一请求发两次就加两次额度。提交中必须禁用
 * 按钮——不能靠"用户不会连点"。
 */
function GrantForm({ onGranted }: { onGranted: () => void }) {
  const t = useTranslations("AdminUsers");
  const [email, setEmail] = useState("");
  const [monthly, setMonthly] = useState("");
  const [addon, setAddon] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          monthly: Number(monthly) || 0,
          addon: Number(addon) || 0,
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "message" in data && typeof data.message === "string"
            ? data.message
            : t("grantFailed");
        setError(msg);
        setState("error");
        return;
      }
      setState("done");
      setEmail("");
      setMonthly("");
      setAddon("");
      // 刷新列表里的余额。不刷的话管理员看到数字没变会以为没成功而再发一次，
      // 而这个接口不幂等（见上面的注释），那一次会真的再加一遍。
      // 邮箱也一起清掉：留着它 + 余额没变 = 一个"再点一次提交"的邀请。
      onGranted();
    } catch {
      setError(t("grantFailed"));
      setState("error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-input p-4">
      <h2 className="font-medium">{t("grantTitle")}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="grant-email">{t("grantEmailLabel")}</Label>
          <Input
            id="grant-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="w-32 space-y-1.5">
          <Label htmlFor="grant-monthly">{t("grantMonthlyLabel")}</Label>
          <Input
            id="grant-monthly"
            type="number"
            min={0}
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
          />
        </div>
        <div className="w-32 space-y-1.5">
          <Label htmlFor="grant-addon">{t("grantAddonLabel")}</Label>
          <Input
            id="grant-addon"
            type="number"
            min={0}
            value={addon}
            onChange={(e) => setAddon(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={state === "sending"}>
          {state === "sending" ? t("granting") : t("grant")}
        </Button>
      </div>
      {state === "done" && <p className="text-sm text-success">{t("granted")}</p>}
      {state === "error" && error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

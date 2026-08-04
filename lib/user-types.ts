/**
 * 后台用户管理的类型。与后端 `internal/handler/admin_users.go` 的 adminUserResponse
 * 一一对应。
 */

export type AdminUser = {
  id: number;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  /** 余额随行返回，省掉前端为每一行再发一次请求。没有账户行的用户是 0。 */
  monthlyCredits: number;
  addonCredits: number;
};

/**
 * 角色与状态的取值。与后端 `internal/model/user.go` 的常量保持一致。
 *
 * 用字面量联合而不是 string：过滤下拉框和 PATCH 请求体都从这里取值，写错一个字
 * 会在编译期被发现，而不是变成一个后端回 400 的运行时错误。
 */
export const USER_ROLES = ["user", "admin"] as const;
export const USER_STATUSES = ["active", "banned"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];

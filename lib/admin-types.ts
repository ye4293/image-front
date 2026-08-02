/**
 * 后台设置项。与后端 `internal/handler/admin_settings.go` 的输出一一对应。
 *
 * 判别联合而不是「`value` 与 `masked` 都可选」：后端对非 secret 项只给 `value`、
 * 对 secret 项只给 `configured` + `masked`，**永不回传 secret 明文**。用可选字段
 * 表达会让消费方写出 `field.value ?? field.masked` 这种把两种语义混在一起的代码，
 * 而那正是让明文有机会被显示出来的第一步。
 */
export type SettingField =
  | { kind: "plain"; value: string }
  | { kind: "secret"; configured: boolean; masked: string };

export type AdminSettings = {
  fields: Record<string, SettingField>;
  storageEnabled: boolean;
};

/** 哪些 key 是 secret。与后端 `settings.Specs` 的 `Secret` 标记保持一致。 */
export const SECRET_KEYS = ["fluxApiKey", "r2AccessKeyId", "r2SecretAccessKey"] as const;

/** 页面上的展示顺序。与后端白名单同集合，但顺序由前端决定。 */
export const SETTING_KEYS = [
  "ezlinkaiBaseUrl",
  "fluxApiKey",
  "r2Endpoint",
  "r2AccessKeyId",
  "r2SecretAccessKey",
  "r2Bucket",
  "r2PublicBaseUrl",
  "appBaseUrl",
] as const;

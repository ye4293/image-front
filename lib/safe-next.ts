/**
 * 校验"登录后回哪儿"的 `next` 参数。
 *
 * **这不是可选的加固，是开放重定向（open redirect）防护。** `next` 来自 URL，任何人
 * 都能把 `/login?next=https://evil.example/login` 发给受害者：域名是我们的、登录表单
 * 是真的，登录成功后却被甩到一个像素级复刻的钓鱼页要求"再确认一次密码"。
 *
 * 只放行**站内绝对路径**：
 *   - 必须以单个 `/` 开头 —— 挡掉 `https://…`、`javascript:` 这类绝对 URL；
 *   - 不能以 `//` 或 `/\` 开头 —— 那是协议相对 URL，`//evil.example` 会跳出站；
 *     浏览器还会把反斜杠当正斜杠处理，所以 `/\evil.example` 同样危险；
 *   - 不含控制字符 —— 换行/制表符会被某些 URL 解析器忽略，可用来绕过前两条。
 *
 * 语言前缀不用管：调用方走 `@/i18n/navigation` 的 router，它会按当前语言补前缀。
 */

/**
 * 控制字符检测。**用码点比较而不是正则。**
 *
 * 正则里的控制字符范围只能靠源码中的转义序列表达，而编辑器、格式化工具与跨平台的
 * 换行处理都可能把它展开成真的不可见字节（写本文件时就真被展开过一次）——那之后
 * 这一行就没人敢碰了。码点比较不依赖源码里存了什么字节。
 */
function hasControlChars(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeNextPath(value: string | undefined | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (hasControlChars(value)) return null;
  return value;
}

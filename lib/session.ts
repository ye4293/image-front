import { cookies } from "next/headers";

// 刻意**不**在这里 re-export TOKEN_COOKIE：拆出 lib/cookie-name.ts 的全部意义
// 就是让这个常量无法经由一个 import 了 next/headers 的模块被取到。一旦 re-export，
// Edge 运行时的 proxy.ts 从这里 import 会通过类型检查、有自动补全、看着完全合理，
// 却把 next/headers 拖进 Edge bundle 导致 next build 失败。
import { TOKEN_COOKIE } from "@/lib/cookie-name";

/** 与后端 JWT 有效期保持一致：7 天（internal/auth/jwt.go） */
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export async function getToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(TOKEN_COOKIE)?.value;
}

export async function setToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearToken(): Promise<void> {
  const store = await cookies();
  // 显式传 path：删除的作用域必须与 setToken 的写入完全对齐。Next 内置的 cookie
  // 库目前会把 path 默认成 "/"，但那是它的实现细节；不写就是在依赖它，一旦默认值变了
  // 删除会被限定在 "/api/auth/"，cookie 在登出后依然存活。
  store.delete({ name: TOKEN_COOKIE, path: "/" });
}

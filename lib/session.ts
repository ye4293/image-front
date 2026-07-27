import { cookies } from "next/headers";

import { TOKEN_COOKIE } from "@/lib/cookie-name";
export { TOKEN_COOKIE };

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
  store.delete(TOKEN_COOKIE);
}

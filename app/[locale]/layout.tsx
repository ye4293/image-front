import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { SiteHeader } from "@/components/site-header";
import { isLocale, locales } from "@/i18n/routing";

// Kumo 用 Inter。等宽字体它用的是 Cloudflare 私有的 Paper Mono，外部拿不到，
// 用 Geist Mono 顶——同为中性偏方的 grotesk mono，观感最接近，且本就已装。
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("title"), description: t("description") };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  // proxy.ts 只会 rewrite 到已知语言，但 `/xx/login` 这种手敲的 URL 会带着未知
  // 语言段直接命中本布局。不拦的话 i18n/request.ts 会静默回退到英文，用户看到的
  // 是一个 URL 写着 xx、内容却是英文的页面——404 更诚实。
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  return (
    // lang 必须跟随实际语言。之前硬编码 "en"，对四种语言里的三种都是错的：
    // 屏幕阅读器会用英语语音去念中日韩文本，搜索引擎也会误判页面语言。
    <html
      lang={locale}
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          必须是**同步**内联 script，且必须在 body 之前跑完：晚一步用户就会看见
          一帧白底再跳成暗色。next/script 的任何 strategy 都不够早，
          所以这里直接用 dangerouslySetInnerHTML，这是它少数正当的用途之一。

          localStorage 缺失时回退到系统偏好，而不是硬写亮色——首次访问的
          暗色偏好用户不该被闪一下。
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {/* 让客户端组件（auth-form、workbench 等）拿到词条。不带 props 时它会
            自动继承服务端已解析的 locale / messages，不必手工再传一遍。 */}
        <NextIntlClientProvider>
          <SiteHeader />
          <main id="main-content" className="flex flex-1 flex-col">
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

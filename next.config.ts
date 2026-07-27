import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// 插件把 `i18n/request.ts` 编译进 bundle 并接上 next-intl 的服务端配置。
// 默认约定路径就是 `./i18n/request.ts`，所以这里不传参——一旦移动该文件，
// 必须回来显式传路径。
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  devIndicators: {
    // 默认位置是 bottom-left，正好压在工作台生成按钮上——那个按钮被刻意锚在
    // 左侧参数列底部（调研结论：Midjourney/Krea/Recraft/Firefly/Freepik 都是
    // 底部锚定 prompt + 内嵌生成按钮）。重叠的后果不只是难看：浮标会拦截指针
    // 事件，dev 模式下**根本点不到生成按钮**，Playwright 也会因
    // "<nextjs-portal> intercepts pointer events" 直接超时。
    // 生产构建没有这个浮标，所以这纯粹是开发期问题——但它会挡住每一次手工验证。
    position: "bottom-right",
  },
};

export default withNextIntl(nextConfig);

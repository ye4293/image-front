import type { NextConfig } from "next";

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

export default nextConfig;

"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

/**
 * 明暗切换。
 *
 * 单独成文件是因为 SiteHeader 是 async 服务端组件，装不下 hook。
 *
 * 不引 next-themes：为一个 class 开关加一个运行时依赖不值得。首帧防闪由
 * layout.tsx <head> 里那段同步 script 负责——它必须在 React 之前跑完，
 * 所以那部分逻辑不能挪到这里来。
 *
 * 状态**只有 DOM 一份**：防闪 script 在 React 之前就把 .dark 写好了，本组件只是
 * 读它，不另存 state、也不再读一遍 localStorage——每多一处真相就多一种对不上的可能。
 */

// 订阅 <html> 的 class 变化。.dark 的**真实来源**是 DOM——layout 里那段防闪 script
// 在 React 之前就写了它，本组件只是它的读者。自己再存一份 state 就会有两份真相。
//
// 这两个函数刻意放在模块作用域：useSyncExternalStore 会按引用判断是否要重新订阅，
// 写成组件内的闭包会导致每次渲染都拆掉再装一遍 MutationObserver。
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function isDark() {
  return document.documentElement.classList.contains("dark");
}

// 服务端渲染时读不到 document，只能报 false。首帧图标因此可能是错的，但 <html> 的
// class 由防闪 script 保证从第一帧就对，页面不会闪白——闪一下图标远比闪一屏白底轻。
function isDarkOnServer() {
  return false;
}

export function ThemeToggle() {
  const t = useTranslations("Nav");
  // useSyncExternalStore 正是为"读 React 之外的状态"设计的：不用 effect + setState
  // 去镜像 DOM，也就不会踩 react-hooks/set-state-in-effect。
  const dark = useSyncExternalStore(subscribe, isDark, isDarkOnServer);

  function toggle() {
    const next = !isDark();
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    // 不必 setState：class 一变，上面的 MutationObserver 会把新值推回来。
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label={t("theme")}
    >
      {dark ? <Moon /> : <Sun />}
    </Button>
  );
}

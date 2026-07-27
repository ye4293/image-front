"use client"; // 错误边界必须是客户端组件

import { Button } from "@/components/ui/button";

export default function Error({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  // 刻意不渲染 error.message：生产环境下 Next 已把服务端组件的报错擦成 digest，
  // 但客户端组件抛出的错误会原样带着原始 message 传过来。统一不显示，就不用逐个
  // 判断某条报错到底是从哪一侧来的。
  return (
    <section className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Sorry — we hit an unexpected problem loading this page.
      </p>
      <Button className="mt-6" onClick={() => unstable_retry()}>
        Try again
      </Button>
    </section>
  );
}

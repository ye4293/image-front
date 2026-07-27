"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { CreditBalance } from "@/lib/generation-types";

export function InsufficientCreditsDialog({
  open,
  balance,
  onClose,
}: {
  open: boolean;
  balance: CreditBalance;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-testid="insufficient-credits-dialog"
      onClose={onClose}
      className="rounded-lg border p-0 backdrop:bg-black/40"
    >
      <div className="w-80 space-y-3 p-5">
        <h2 className="text-lg font-semibold">次数不够了</h2>
        <p className="text-sm text-muted-foreground">
          当前剩余月度 {balance.monthly} 次、加量包 {balance.addon} 次，不足以完成这次生成。
        </p>
        <div className="flex gap-2 pt-1">
          {/* 导航用 Link + buttonVariants，不用 Button render——见计划顶部铁律 3。 */}
          <Link href="/pricing" className={buttonVariants({ size: "sm" })}>
            查看套餐
          </Link>
          <button
            type="button"
            onClick={onClose}
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            稍后再说
          </button>
        </div>
      </div>
    </dialog>
  );
}

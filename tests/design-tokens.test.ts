import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 守住"颜色只走语义 token"这条规则。
 *
 * 为什么要一条常驻测试而不是改完人工检查一遍：字面色（bg-neutral-50 之类）在
 * 亮色下看着没问题，坏的只有暗色——而暗色是要手动切过去才看得见的。
 * 回流一处，代价是某个页面在暗色下白底白字，而没人会注意到。
 *
 * `components/ui/` 里 shadcn 原语形如 `dark:bg-input/30` 的写法是**合法的**：
 * 那是语义变量加透明度微调，不是字面色，本规则不会误伤。
 */

const ROOTS = ["components", "app"];

const PALETTE = [
  "slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber",
  "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue",
  "indigo", "violet", "purple", "fuchsia", "pink", "rose",
].join("|");

const UTILITY = [
  "bg", "text", "border", "ring", "from", "via", "to", "outline",
  "decoration", "divide", "fill", "stroke", "caret", "placeholder", "shadow",
].join("|");

const LITERAL_COLOR = new RegExp(`\\b(?:${UTILITY})-(?:${PALETTE})-\\d{2,3}\\b`, "g");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsxFiles(full));
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("设计 token 守卫", () => {
  it("组件与页面里不出现 Tailwind 调色板字面色", () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of tsxFiles(root)) {
        const lines = readFileSync(file, "utf8").split(/\r?\n/);
        lines.forEach((line, i) => {
          const hits = line.match(LITERAL_COLOR);
          if (hits) offenders.push(`${file}:${i + 1}  ${hits.join(" ")}`);
        });
      }
    }

    expect(offenders).toEqual([]);
  });
});

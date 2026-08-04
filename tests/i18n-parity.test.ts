import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 守住"四个语言文件的 key 集合完全一致"。
 *
 * 为什么要一条常驻测试：仓库此前对漏译**零保障**。没有 next-intl 的 IntlMessages
 * 类型增强，所以 `t("typo")` 不会编译报错；唯一的兜底是 dev 下运行时抛
 * MISSING_MESSAGE——那要求有人正好用那个语言打开那个页面。生产上表现为界面里
 * 直接显示 key 本身（比如 "AdminUsers.colEmail"），而中日韩三语平时没人看。
 *
 * 触发这条测试的典型场景不是"忘了翻译"，而是"只给 en 加了一条就走了"。
 * 一次加三个后台页面、上百条词条时，那几乎必然发生。
 */

const MESSAGES_DIR = path.join(process.cwd(), "messages");

/** 递归把嵌套对象拍平成 "a.b.c" 形式的 key 集合。 */
function flatten(obj: Record<string, unknown>, prefix = ""): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const nested of flatten(v as Record<string, unknown>, full)) out.add(nested);
    } else {
      out.add(full);
    }
  }
  return out;
}

function loadKeys(locale: string): Set<string> {
  const raw = readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8");
  return flatten(JSON.parse(raw) as Record<string, unknown>);
}

describe("i18n 四语一致性", () => {
  const locales = readdirSync(MESSAGES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();

  it("语言文件与 i18n/routing.ts 声明的一致", () => {
    // 硬编码期望值：新增一门语言时这条会失败，提醒你 routing.ts 与 messages/
    // 两处都要动。只比较目录内容的话，加了文件却忘了在 routing 里注册不会被发现。
    expect(locales).toEqual(["en", "ja", "ko", "zh"]);
  });

  const base = "en";
  const baseKeys = loadKeys(base);

  it(`${base} 有词条（防止基准文件被清空导致其余断言假绿）`, () => {
    expect(baseKeys.size).toBeGreaterThan(50);
  });

  for (const locale of ["zh", "ja", "ko"]) {
    it(`${locale} 与 ${base} 的 key 集合完全相同`, () => {
      const keys = loadKeys(locale);
      const missing = [...baseKeys].filter((k) => !keys.has(k)).sort();
      const extra = [...keys].filter((k) => !baseKeys.has(k)).sort();

      // 分开断言：缺失与多余是两种不同的错误。缺失 = 漏译（界面显示 key 本身）；
      // 多余 = 删 en 词条时忘了删其他语言，属于死词条，会让人以为某个功能还在。
      expect(missing, `${locale} 缺少这些词条（界面上会直接显示 key 本身）`).toEqual([]);
      expect(extra, `${locale} 有 ${base} 里没有的词条（多半是删 en 时漏删）`).toEqual([]);
    });
  }

  it("没有空字符串词条", () => {
    // 空串会渲染成空白，看起来像"这里本来就没东西"，比显示 key 更难发现。
    for (const locale of locales) {
      const raw = readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const empties: string[] = [];
      const walk = (obj: Record<string, unknown>, prefix = "") => {
        for (const [k, v] of Object.entries(obj)) {
          const full = prefix ? `${prefix}.${k}` : k;
          if (v !== null && typeof v === "object" && !Array.isArray(v)) {
            walk(v as Record<string, unknown>, full);
          } else if (typeof v === "string" && v.trim() === "") {
            empties.push(full);
          }
        }
      };
      walk(data);
      expect(empties, `${locale} 有空词条`).toEqual([]);
    }
  });
});

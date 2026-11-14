import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function collectAllKeys(
  obj: Record<string, unknown>,
  prefix = "",
): string[] {
  return Object.keys(obj).flatMap((key) => {
    const next = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return collectAllKeys(value as Record<string, unknown>, next);
    }
    return [next];
  });
}

function findDuplicateJsonObjectKeys(raw: string): string[] {
  const stack = [new Set<string>()];
  const duplicates: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*"([^"]+)":\s*(.*)/);
    if (match) {
      const key = match[1]!;
      const rest = match[2]!.trim();
      const scope = stack[stack.length - 1]!;
      if (scope.has(key)) {
        duplicates.push(key);
      }
      scope.add(key);
      if (rest.endsWith("{")) {
        stack.push(new Set<string>());
      }
    } else if (/^\s*\}[,]?\s*$/.test(line)) {
      stack.pop();
    }
  }

  return duplicates;
}

describe("i18n message catalogs and smoke test", () => {
  it("contains zero duplicate keys and matching AR/EN keys including insights.title", () => {
    const arRaw = readFileSync(
      path.resolve(process.cwd(), "messages/ar.json"),
      "utf8",
    );
    const enRaw = readFileSync(
      path.resolve(process.cwd(), "messages/en.json"),
      "utf8",
    );

    expect(findDuplicateJsonObjectKeys(arRaw)).toEqual([]);
    expect(findDuplicateJsonObjectKeys(enRaw)).toEqual([]);

    const ar = JSON.parse(arRaw) as Record<string, unknown>;
    const en = JSON.parse(enRaw) as Record<string, unknown>;

    const arKeys = new Set(collectAllKeys(ar));
    const enKeys = new Set(collectAllKeys(en));

    expect(arKeys.has("insights.title")).toBe(true);
    expect(arKeys.has("insights.alerts.wasteSpike")).toBe(true);
    expect(enKeys.has("insights.title")).toBe(true);
    expect(enKeys.has("insights.alerts.wasteSpike")).toBe(true);
    expect([...arKeys].sort()).toEqual([...enKeys].sort());
  });
});

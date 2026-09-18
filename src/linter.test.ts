import { test } from "node:test";
import assert from "node:assert/strict";
import { lint } from "./linter.js";

interface Case {
  name: string;
  ruleId: string;
  source: string;
  expectedLines: number[];
}

// Each case targets one rule and one awkward edge in its detection logic,
// not just the happy-path bug it exists to catch.
const cases: Case[] = [
  {
    name: "flags a strict > against a limit",
    ruleId: "rate-limit-off-by-one",
    source: "if (count > limit) {\n  block();\n}",
    expectedLines: [1],
  },
  {
    name: "does not flag >= against a limit",
    ruleId: "rate-limit-off-by-one",
    source: "if (count >= limit) {\n  block();\n}",
    expectedLines: [],
  },
  {
    name: "does not flag the operands in reversed order",
    ruleId: "rate-limit-off-by-one",
    source: "if (limit > count) {\n  allow();\n}",
    expectedLines: [],
  },
  {
    name: "ignores a commented-out example of the bug",
    ruleId: "rate-limit-off-by-one",
    source: "// old check was: count > limit\nif (count >= limit) block();",
    expectedLines: [],
  },
  {
    name: "flags it even with no surrounding whitespace",
    ruleId: "rate-limit-off-by-one",
    source: "if(requests>threshold)block();",
    expectedLines: [1],
  },
  {
    name: "flags retryAfter computed by unclamped subtraction",
    ruleId: "rate-limit-negative-retry-after",
    source: "const retryAfter = resetAt - Date.now();",
    expectedLines: [1],
  },
  {
    name: "does not flag a Math.max(0, ...) clamp",
    ruleId: "rate-limit-negative-retry-after",
    source: "const retryAfter = Math.max(0, resetAt - Date.now());",
    expectedLines: [],
  },
  {
    name: "does not flag a ternary clamp idiom",
    ruleId: "rate-limit-negative-retry-after",
    source: "res.retryAfter = delta < 0 ? 0 : delta;",
    expectedLines: [],
  },
  {
    name: "does not mistake the header string's hyphen for subtraction",
    ruleId: "rate-limit-negative-retry-after",
    source: "res.setHeader('Retry-After', String(seconds));",
    expectedLines: [],
  },
  {
    name: "flags a bucket Map with no cleanup anywhere in the file",
    ruleId: "rate-limit-unbounded-store",
    source: "const buckets = new Map();\nbuckets.set(ip, count);",
    expectedLines: [1],
  },
  {
    name: "does not flag it once a .delete call appears in the file",
    ruleId: "rate-limit-unbounded-store",
    source: "const buckets = new Map();\nbuckets.set(ip, count);\nbuckets.delete(ip);",
    expectedLines: [],
  },
  {
    name: "does not flag WeakMap, which the GC can reclaim on its own",
    ruleId: "rate-limit-unbounded-store",
    source: "const buckets = new WeakMap();",
    expectedLines: [],
  },
  {
    name: "does not flag a Map whose name has nothing to do with rate limiting",
    ruleId: "rate-limit-unbounded-store",
    source: "const cache = new Map();",
    expectedLines: [],
  },
  {
    name: "flags a typed Map declaration with generic type arguments",
    ruleId: "rate-limit-unbounded-store",
    source: "const limiterStore = new Map<string, number>();",
    expectedLines: [1],
  },
  {
    name: "flags Math.random() jitter with no floor",
    ruleId: "rate-limit-zero-jitter",
    source: "const delay = Math.random() * 1000;",
    expectedLines: [1],
  },
  {
    name: "does not flag a floor added before the random term",
    ruleId: "rate-limit-zero-jitter",
    source: "const delay = 50 + Math.random() * 1000;",
    expectedLines: [],
  },
  {
    name: "does not flag a floor added after the random term",
    ruleId: "rate-limit-zero-jitter",
    source: "const delay = Math.random() * 1000 + 50;",
    expectedLines: [],
  },
  {
    name: "does not flag a Math.max clamp",
    ruleId: "rate-limit-zero-jitter",
    source: "const delay = Math.max(50, Math.random() * 1000);",
    expectedLines: [],
  },
];

for (const c of cases) {
  test(`${c.ruleId}: ${c.name}`, () => {
    const findings = lint(c.source)
      .filter((f) => f.ruleId === c.ruleId)
      .map((f) => f.line);
    assert.deepEqual(findings, c.expectedLines);
  });
}

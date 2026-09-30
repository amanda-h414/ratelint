import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "./config.js";
import { lint } from "./linter.js";

const source = "if (count > limit) block();\nconst delay = Math.random() * 1000;";

test("parseConfig accepts valid levels", () => {
  const settings = parseConfig(
    '{"rules":{"rate-limit-zero-jitter":"off","rate-limit-off-by-one":"error"}}',
  );
  assert.deepEqual(settings, {
    "rate-limit-zero-jitter": "off",
    "rate-limit-off-by-one": "error",
  });
});

test("parseConfig treats a missing rules section as defaults", () => {
  assert.deepEqual(parseConfig("{}"), {});
});

test("parseConfig rejects an unknown rule id", () => {
  assert.throws(
    () => parseConfig('{"rules":{"rate-limit-typo":"off"}}'),
    /unknown rule "rate-limit-typo"/,
  );
});

test("parseConfig rejects an invalid level", () => {
  assert.throws(
    () => parseConfig('{"rules":{"rate-limit-off-by-one":"fatal"}}'),
    /must be one of/,
  );
});

test("parseConfig rejects malformed JSON and non-object input", () => {
  assert.throws(() => parseConfig("{"), /invalid JSON/);
  assert.throws(() => parseConfig("[]"), /JSON object/);
  assert.throws(() => parseConfig('{"rules":[]}'), /"rules" must be an object/);
});

test("lint skips a rule set to off", () => {
  const ids = lint(source, { "rate-limit-zero-jitter": "off" }).map((f) => f.ruleId);
  assert.deepEqual(ids, ["rate-limit-off-by-one"]);
});

test("lint applies a severity override", () => {
  const findings = lint(source, { "rate-limit-off-by-one": "error" });
  const byRule = Object.fromEntries(findings.map((f) => [f.ruleId, f.severity]));
  assert.equal(byRule["rate-limit-off-by-one"], "error");
  assert.equal(byRule["rate-limit-zero-jitter"], "warning");
});

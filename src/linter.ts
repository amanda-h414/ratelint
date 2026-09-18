export type Severity = "warning" | "error";

export interface Finding {
  ruleId: string;
  severity: Severity;
  line: number;
  message: string;
}

export interface Rule {
  id: string;
  severity: Severity;
  description: string;
  check(lines: string[], source: string): Finding[];
}

function isCommentLine(line: string): boolean {
  return line.trim().startsWith("//");
}

// Blank out string literal contents so a hyphen or word inside a quoted
// header name ('Retry-After') doesn't get mistaken for an arithmetic
// operator or an identifier the rules are looking for.
function stripStrings(line: string): string {
  return line.replace(
    /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g,
    (match) => " ".repeat(match.length),
  );
}

const offByOneLimitCheck: Rule = {
  id: "rate-limit-off-by-one",
  severity: "warning",
  description:
    'flags "count > limit" style checks that let one extra request through before blocking; use ">="',
  check(lines) {
    const findings: Finding[] = [];
    const pattern =
      /\b(?:count|requests?|hits|calls|attempts)\s*>\s*(?:limit|max\w*|threshold|cap)\b/i;
    lines.forEach((raw, i) => {
      if (isCommentLine(raw)) return;
      if (pattern.test(stripStrings(raw))) {
        findings.push({
          ruleId: this.id,
          severity: this.severity,
          line: i + 1,
          message:
            'strict ">" comparison against a limit allows one extra request through before blocking; use ">="',
        });
      }
    });
    return findings;
  },
};

const negativeRetryAfter: Rule = {
  id: "rate-limit-negative-retry-after",
  severity: "warning",
  description:
    "flags a retryAfter/Retry-After value computed by subtraction with no clamp to zero",
  check(lines) {
    const findings: Finding[] = [];
    lines.forEach((raw, i) => {
      if (isCommentLine(raw)) return;
      const line = stripStrings(raw);
      if (!/retry.?after/i.test(line)) return;
      if (!/-/.test(line)) return;
      if (/Math\.max\(\s*0/.test(line)) return;
      if (/[<>]=?\s*0\s*\?/.test(line) || /\?\s*0\s*:/.test(line)) return;
      findings.push({
        ruleId: this.id,
        severity: this.severity,
        line: i + 1,
        message:
          "retryAfter is computed by subtraction with no clamp to zero; a stale reset time produces a negative wait",
      });
    });
    return findings;
  },
};

const unboundedStore: Rule = {
  id: "rate-limit-unbounded-store",
  severity: "warning",
  description:
    "flags a Map used as a rate-limit bucket store with no visible cleanup, which grows without bound as new keys appear",
  check(lines, source) {
    const findings: Finding[] = [];
    const hasCleanup = /\.delete\(|setInterval\(|WeakMap/.test(source);
    if (hasCleanup) return findings;

    const declPattern =
      /\b(?:const|let|var)\s+(\w*(?:bucket|limiter|store|counters?)\w*)\s*(?::[^=]+)?=\s*new\s+Map\s*(?:<[^>]*>)?\s*\(/i;

    lines.forEach((raw, i) => {
      if (isCommentLine(raw)) return;
      const match = raw.match(declPattern);
      if (match) {
        findings.push({
          ruleId: this.id,
          severity: this.severity,
          line: i + 1,
          message: `"${match[1]}" is a Map with no visible cleanup (.delete/setInterval) in this file; expired keys are never removed`,
        });
      }
    });
    return findings;
  },
};

const zeroFloorJitter: Rule = {
  id: "rate-limit-zero-jitter",
  severity: "warning",
  description:
    "flags Math.random() used as a backoff delay with no minimum floor, which occasionally produces a zero-length wait",
  check(lines) {
    const findings: Finding[] = [];
    const pattern = /Math\.random\(\)\s*\*\s*[\w.]+/;
    lines.forEach((raw, i) => {
      if (isCommentLine(raw)) return;
      const line = stripStrings(raw);
      const match = line.match(pattern);
      if (!match || match.index === undefined) return;
      if (/Math\.max\(/.test(line)) return;

      const before = line.slice(0, match.index);
      const after = line.slice(match.index + match[0].length);
      const hasFloorBefore = /\+\s*$/.test(before);
      const hasFloorAfter = /^\s*\+/.test(after);
      if (hasFloorBefore || hasFloorAfter) return;

      findings.push({
        ruleId: this.id,
        severity: this.severity,
        line: i + 1,
        message:
          "Math.random() * n used as a delay with no minimum floor; this can produce a zero-length wait and defeat the backoff",
      });
    });
    return findings;
  },
};

export const rules: Rule[] = [
  offByOneLimitCheck,
  negativeRetryAfter,
  unboundedStore,
  zeroFloorJitter,
];

export function lint(source: string): Finding[] {
  const lines = source.split(/\r\n|\r|\n/);
  const findings = rules.flatMap((rule) => rule.check(lines, source));
  findings.sort((a, b) => a.line - b.line || a.ruleId.localeCompare(b.ruleId));
  return findings;
}

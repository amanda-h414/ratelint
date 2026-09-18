#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { lint } from "./linter.js";

function main(argv: string[]): number {
  const files = argv.slice(2);
  if (files.length === 0) {
    console.error("usage: ratelint <file> [file...]");
    return 2;
  }

  let hasFindings = false;
  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch (err) {
      console.error(`ratelint: cannot read ${file}: ${(err as Error).message}`);
      hasFindings = true;
      continue;
    }

    for (const finding of lint(source)) {
      hasFindings = true;
      console.log(
        `${file}:${finding.line}: ${finding.severity} ${finding.message} [${finding.ruleId}]`,
      );
    }
  }

  return hasFindings ? 1 : 0;
}

process.exit(main(process.argv));

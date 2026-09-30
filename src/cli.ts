#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { loadConfig } from "./config.js";
import { lint, type RuleSettings } from "./linter.js";

const USAGE = "usage: ratelint [--config <file>] <file> [file...]";

function main(argv: string[]): number {
  const args = argv.slice(2);
  let configPath: string | undefined;
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" || args[i] === "-c") {
      configPath = args[++i];
      if (configPath === undefined) {
        console.error(USAGE);
        return 2;
      }
    } else {
      files.push(args[i]);
    }
  }

  if (files.length === 0) {
    console.error(USAGE);
    return 2;
  }

  let settings: RuleSettings;
  try {
    settings = loadConfig(configPath);
  } catch (err) {
    console.error(`ratelint: ${(err as Error).message}`);
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

    for (const finding of lint(source, settings)) {
      hasFindings = true;
      console.log(
        `${file}:${finding.line}: ${finding.severity} ${finding.message} [${finding.ruleId}]`,
      );
    }
  }

  return hasFindings ? 1 : 0;
}

process.exit(main(process.argv));

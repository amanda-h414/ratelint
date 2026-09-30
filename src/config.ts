import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rules, type RuleSettings } from "./linter.js";

export const DEFAULT_CONFIG_NAME = "ratelint.json";

const LEVELS = ["off", "warning", "error"];

// Config shape: { "rules": { "<rule-id>": "off" | "warning" | "error" } }.
// Unknown rule ids and bad levels are errors rather than being ignored, since
// a typo in a rule id would otherwise silently leave the rule enabled.
export function parseConfig(text: string, origin = DEFAULT_CONFIG_NAME): RuleSettings {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`${origin}: invalid JSON: ${(err as Error).message}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`${origin}: expected a JSON object at the top level`);
  }

  const section = (data as Record<string, unknown>).rules;
  if (section === undefined) return {};
  if (typeof section !== "object" || section === null || Array.isArray(section)) {
    throw new Error(`${origin}: "rules" must be an object`);
  }

  const known = new Set(rules.map((r) => r.id));
  const settings: RuleSettings = {};
  for (const [id, level] of Object.entries(section)) {
    if (!known.has(id)) {
      throw new Error(`${origin}: unknown rule "${id}"`);
    }
    if (typeof level !== "string" || !LEVELS.includes(level)) {
      throw new Error(
        `${origin}: level for "${id}" must be one of ${LEVELS.join(", ")}`,
      );
    }
    settings[id] = level as RuleSettings[string];
  }
  return settings;
}

// An explicit path must exist; otherwise ratelint.json in the working
// directory is used if present, and no config means all rules at defaults.
export function loadConfig(explicitPath?: string, cwd = process.cwd()): RuleSettings {
  const path = resolve(cwd, explicitPath ?? DEFAULT_CONFIG_NAME);
  if (explicitPath === undefined && !existsSync(path)) return {};
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`cannot read ${path}: ${(err as Error).message}`);
  }
  return parseConfig(text, explicitPath ?? DEFAULT_CONFIG_NAME);
}

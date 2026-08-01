import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where telemetry credentials live between sessions.
 *
 * The Blob token is created by the Vercel Blob integration and is marked sensitive, so
 * `vercel env pull` returns it EMPTY and `vercel blob` cannot mint one either -- there is no CLI
 * path to it at all. That left every session re-discovering the same dead end and then working
 * around it, which is worse than having no telemetry: the diagnosis quietly falls back to guessing.
 *
 * So the tools now read a durable local file when the variable is absent from the environment.
 * Populate it once and telemetry works from then on, in this shell and every future one.
 */
export const CREDENTIALS_PATH = join(homedir(), ".config", "guns-only", "telemetry.env");

const TOKEN_NAMES = new Set([
  "BLOB_READ_WRITE_TOKEN",
  "TELEMETRY_ADMIN_TOKEN",
  "TELEMETRY_REPORT_TOKEN",
]);

/** Parse KEY=VALUE lines. Values may be quoted; everything else is ignored. */
function parse(text) {
  const out = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    if (!TOKEN_NAMES.has(key)) continue;
    let value = line.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value) out[key] = value;
  }
  return out;
}

/**
 * The environment, with any missing telemetry token filled in from the credentials file.
 *
 * The environment always wins, so an explicit `TOKEN=... node tools/telemetry/...` still overrides
 * the file. Nothing here is ever printed, and a file readable by anyone but the owner is refused
 * rather than used -- a credential with loose permissions is a finding, not a convenience.
 */
export function environmentWithCredentials(environment = process.env, path = CREDENTIALS_PATH) {
  const missing = [...TOKEN_NAMES].filter((name) => {
    const value = environment[name];
    return typeof value !== "string" || !value.trim();
  });
  if (missing.length === 0) return environment;

  let text;
  try {
    const info = statSync(path);
    // 0o077 = any permission for group or other.
    if ((info.mode & 0o077) !== 0) {
      throw new Error(
        `${path} is readable beyond its owner; run: chmod 600 ${path}`,
      );
    }
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return environment;
    throw error;
  }

  const fromFile = parse(text);
  const merged = { ...environment };
  for (const name of missing) {
    if (fromFile[name]) merged[name] = fromFile[name];
  }
  return merged;
}

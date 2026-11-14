import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readRuntimeFlags } from "../src/env.core";

export function assertNonProductionScript(scriptName: string): void {
  const { NODE_ENV, VERCEL_ENV } = readRuntimeFlags();
  if (NODE_ENV === "production" || VERCEL_ENV === "production") {
    throw new Error(`${scriptName} is restricted to development environments.`);
  }
}

export function loadDevEnvFile(filename = ".env"): void {
  const envPath = path.resolve(process.cwd(), filename);
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function parseCliDateArg(rawArg: string | undefined): Date {
  if (!rawArg) {
    return new Date();
  }
  const isoCandidate = /^\d{4}-\d{2}-\d{2}$/.test(rawArg.trim())
    ? `${rawArg.trim()}T12:00:00.000+03:00`
    : rawArg.trim();
  const parsed = new Date(isoCandidate);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date argument: ${rawArg}`);
  }
  return parsed;
}

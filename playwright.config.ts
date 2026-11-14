import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { readToolingEnv } from "./src/env.core";

function resolveHeadlessShellExecutable(): string | undefined {
  const cacheDir = path.join(os.homedir(), "Library/Caches/ms-playwright");
  if (!fs.existsSync(cacheDir)) return undefined;
  for (const entry of fs.readdirSync(cacheDir)) {
    const candidate = path.join(
      cacheDir,
      entry,
      "chrome-headless-shell-mac-arm64/chrome-headless-shell",
    );
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

const executablePath = resolveHeadlessShellExecutable();
const toolingEnv = readToolingEnv();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(toolingEnv.CI),
  retries: toolingEnv.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: toolingEnv.APP_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testMatch: /qa-(journeys|admin-isolation)\.spec\.ts/,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});

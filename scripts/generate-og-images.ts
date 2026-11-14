import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

interface OgLocaleSpec {
  locale: "ar" | "en";
  dir: "rtl" | "ltr";
  outFile: string;
  wordmark: string;
  tagline: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  bullets: readonly string[];
  domainLabel: string;
}

interface LandingMessageSlice {
  landing: {
    header: { brandName: string; pilotTag: string };
    hero: {
      eyebrow: string;
      title: string;
      subtitle: string;
      note: string;
      mock: { phoneOfflineReady: string };
    };
  };
}

function resolveChromiumExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  const cacheDir = path.join(os.homedir(), "Library/Caches/ms-playwright");
  if (fs.existsSync(cacheDir)) {
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
  }

  const macChrome =
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return fs.existsSync(macChrome) ? macChrome : undefined;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readLocaleSlice(fileName: string): LandingMessageSlice {
  const fullPath = path.join(process.cwd(), "messages", fileName);
  return JSON.parse(fs.readFileSync(fullPath, "utf8")) as LandingMessageSlice;
}

function loadOgSpecs(): readonly OgLocaleSpec[] {
  const ar = readLocaleSlice("ar.json").landing;
  const en = readLocaleSlice("en.json").landing;

  return [
    {
      locale: "ar",
      dir: "rtl",
      outFile: path.join(process.cwd(), "public/og-ar.png"),
      wordmark: ar.header.brandName,
      tagline: ar.header.pilotTag,
      eyebrow: ar.hero.eyebrow,
      title: ar.hero.title,
      subtitle: ar.hero.subtitle,
      bullets: [ar.hero.mock.phoneOfflineReady, ar.hero.note],
      domainLabel: "wafrah.sa",
    },
    {
      locale: "en",
      dir: "ltr",
      outFile: path.join(process.cwd(), "public/og-en.png"),
      wordmark: en.header.brandName,
      tagline: en.header.pilotTag,
      eyebrow: en.hero.eyebrow,
      title: en.hero.title,
      subtitle: en.hero.subtitle,
      bullets: [en.hero.mock.phoneOfflineReady, en.hero.note],
      domainLabel: "wafrah.sa/en",
    },
  ];
}

function renderOgHtml(spec: OgLocaleSpec): string {
  const isAr = spec.locale === "ar";
  const fontStack = isAr
    ? "'IBM Plex Sans Arabic', 'Geeza Pro', 'SF Arabic', 'Noto Sans Arabic', Arial, sans-serif"
    : "'Inter', 'IBM Plex Sans Arabic', 'SF Pro Display', Arial, sans-serif";

  const bgAccentPos = isAr ? "14% 18%" : "86% 18%";
  const bgMidPos = isAr ? "88% 88%" : "12% 88%";
  const titleSize = isAr ? "64px" : "58px";
  const titleLine = isAr ? "1.28" : "1.14";
  const subSize = isAr ? "28px" : "25px";

  return `<!doctype html>
<html lang="${spec.locale}" dir="${spec.dir}">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 1200px; height: 630px; overflow: hidden;
    font-family: ${fontStack}; background: #0b4f45; color: #fff;
  }
  .canvas {
    position: relative; width: 1200px; height: 630px; padding: 56px 68px;
    display: flex; flex-direction: column; justify-content: space-between;
    background:
      radial-gradient(circle at ${bgAccentPos}, rgba(201,162,39,.24) 0%, rgba(201,162,39,0) 45%),
      radial-gradient(circle at ${bgMidPos}, rgba(14,107,92,.9) 0%, rgba(11,79,69,0) 56%),
      linear-gradient(135deg, #093d35 0%, #0b4f45 48%, #0e6b5c 100%);
  }
  .frame {
    position: absolute; inset: 22px; border-radius: 24px;
    border: 1.5px solid rgba(255,255,255,.16); pointer-events: none;
  }
  .top-bar, .bottom-bar { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
  .brand { display: flex; align-items: center; gap: 16px; }
  .wordmark { font-size: 32px; font-weight: 700; line-height: 1.2; color: #fff; }
  .tagline { margin-top: 4px; font-size: 18px; font-weight: 500; color: #cde5df; }
  .eyebrow {
    display: inline-flex; align-items: center; padding: 10px 22px; border-radius: 999px;
    background: #c9a227; color: #1a1a1a; font-size: 19px; font-weight: 700; white-space: nowrap;
  }
  .content { position: relative; z-index: 1; max-width: 980px; display: flex; flex-direction: column; gap: 22px; }
  .title { font-size: ${titleSize}; font-weight: 700; line-height: ${titleLine}; letter-spacing: ${isAr ? "0" : "-0.02em"}; color: #fff; }
  .subtitle { font-size: ${subSize}; font-weight: 500; line-height: 1.5; color: #e3f2ee; }
  .bottom-bar { padding-top: 22px; border-top: 1px solid rgba(255,255,255,.2); }
  .chips { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .chip {
    display: inline-flex; align-items: center; gap: 9px; padding: 9px 18px; border-radius: 12px;
    background: rgba(255,255,255,.11); border: 1px solid rgba(255,255,255,.2);
    font-size: 18px; font-weight: 600; color: #fff;
  }
  .dot { width: 8px; height: 8px; border-radius: 999px; background: #f3cf5e; flex-shrink: 0; }
  .domain { font-size: 21px; font-weight: 700; color: #f3cf5e; direction: ltr; }
</style>
</head>
<body>
  <main class="canvas">
    <div class="frame"></div>
    <div class="top-bar">
      <div class="brand">
        <svg width="62" height="62" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="1" y="1" width="34" height="34" rx="9" fill="#0E6B5C" stroke="#C9A227" stroke-width="1.5" />
          <path d="M18 8.5C13.6 11.4 11 15.6 11 20C11 24 14.1 27 18 27C21.9 27 25 24 25 20C25 15.6 22.4 11.4 18 8.5Z" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M18 13.5V26.5" stroke="#C9A227" stroke-width="1.8" stroke-linecap="round" />
          <path d="M18 18.5C19.8 17.3 21.3 17 22.6 17.2" stroke="#C9A227" stroke-width="1.7" stroke-linecap="round" />
          <circle cx="18" cy="10.5" r="1.4" fill="#C9A227" />
        </svg>
        <div>
          <div class="wordmark">${escapeHtml(spec.wordmark)}</div>
          <div class="tagline">${escapeHtml(spec.tagline)}</div>
        </div>
      </div>
      <div class="eyebrow">${escapeHtml(spec.eyebrow)}</div>
    </div>
    <div class="content">
      <h1 class="title">${escapeHtml(spec.title)}</h1>
      <p class="subtitle">${escapeHtml(spec.subtitle)}</p>
    </div>
    <div class="bottom-bar">
      <div class="chips">
        ${spec.bullets.map((item) => `<span class="chip"><span class="dot"></span><span>${escapeHtml(item)}</span></span>`).join("")}
      </div>
      <div class="domain">${escapeHtml(spec.domainLabel)}</div>
    </div>
  </main>
</body>
</html>`;
}

async function main() {
  const specs = loadOgSpecs();
  const browser = await chromium.launch({
    executablePath: resolveChromiumExecutable(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    for (const spec of specs) {
      const page = await browser.newPage({
        viewport: { width: 1200, height: 630 },
        deviceScaleFactor: 1,
      });
      await page.setContent(renderOgHtml(spec), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      fs.mkdirSync(path.dirname(spec.outFile), { recursive: true });
      await page.screenshot({
        path: spec.outFile,
        type: "png",
        clip: { x: 0, y: 0, width: 1200, height: 630 },
      });
      await page.close();
      const bytes = fs.statSync(spec.outFile).size;
      console.log(`Generated ${path.relative(process.cwd(), spec.outFile)} (${bytes} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

void main();

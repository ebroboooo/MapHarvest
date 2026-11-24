import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";

export const PROJECT_ROOT = process.cwd();

export function ensureBrowsersPath(): string {
  const local = path.join(PROJECT_ROOT, ".playwright-browsers");
  // Always pin to project-local (or junction). Cursor/sandbox often injects a
  // Temp cache path under %USERPROFILE% that does not contain Chromium.
  process.env.PLAYWRIGHT_BROWSERS_PATH = local;
  return local;
}

function findChromiumExe(root: string): string | null {
  const preferred = [
    path.join(root, "chromium-1254", "chrome-win64", "chrome.exe"),
    path.join(
      root,
      "chromium_headless_shell-1254",
      "chrome-headless-shell-win64",
      "chrome-headless-shell.exe",
    ),
  ];
  for (const p of preferred) {
    if (fs.existsSync(p)) return p;
  }
  if (!fs.existsSync(root)) return null;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (/^(chrome|chrome-headless-shell)\.exe$/i.test(ent.name)) return full;
    }
  }
  return null;
}

export function browsersInstalled(): boolean {
  const root = ensureBrowsersPath();
  return Boolean(findChromiumExe(root));
}

function systemChromePath(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA
      ? path.join(
          process.env.LOCALAPPDATA,
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : null,
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function launchBrowser(headless = true): Promise<Browser> {
  const browsersPath = ensureBrowsersPath();
  const bundled = findChromiumExe(browsersPath);
  const systemChrome = systemChromePath();
  // Prefer installed Google Chrome — bundled Chromium often crashes on Maps
  // under restricted/sandbox shells on Windows.
  const executablePath = systemChrome || bundled;
  if (!executablePath) {
    throw new Error(
      `Playwright Chromium missing under ${browsersPath}. Run npm install.`,
    );
  }
  return chromium.launch({
    headless,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-extensions",
      "--no-first-run",
      "--disable-background-networking",
    ],
  });
}

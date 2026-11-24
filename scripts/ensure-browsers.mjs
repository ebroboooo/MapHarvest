import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browsers = path.join(root, ".playwright-browsers");
process.env.PLAYWRIGHT_BROWSERS_PATH = browsers;

const has =
  fs.existsSync(browsers) &&
  fs.readdirSync(browsers).some((n) => /chromium/i.test(n));

if (has) {
  console.log(`[mapharvest] browsers OK → ${browsers}`);
  process.exit(0);
}

const siblings = [
  path.resolve("E:/Projects/scraping/leadforge/.playwright-browsers"),
  path.resolve("E:/Projects/scraping/mapharvest/.playwright-browsers"),
];

for (const sibling of siblings) {
  if (!fs.existsSync(sibling)) continue;
  try {
    fs.symlinkSync(sibling, browsers, "junction");
    console.log(`[mapharvest] linked browsers → ${sibling}`);
    process.exit(0);
  } catch {
    /* try next */
  }
}

console.log(`[mapharvest] installing Chromium into ${browsers}`);
fs.mkdirSync(browsers, { recursive: true });
const r = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["playwright", "install", "chromium"],
  { stdio: "inherit", env: process.env, cwd: root, shell: true },
);
process.exit(r.status ?? 1);

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ensureBrowsersPath, launchBrowser } from "../src/lib/scraper/browser";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  ensureBrowsersPath();
  const outDir = path.join(process.cwd(), "output");
  mkdirSync(outDir, { recursive: true });

  const browser = await launchBrowser(true);
  browser.on("disconnected", () => console.log("browser disconnected"));

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    locale: "en-US",
    viewport: { width: 1365, height: 900 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();
  page.on("crash", () => console.log("PAGE CRASH"));
  page.on("close", () => console.log("PAGE CLOSE"));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("console error:", msg.text().slice(0, 200));
  });

  const query = "clinic Cairo Egypt";
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
  console.log("goto", url);
  try {
    const resp = await page.goto(url, { waitUntil: "commit", timeout: 60000 });
    console.log("status", resp?.status(), "url", page.url());
  } catch (e) {
    console.log("goto error", e instanceof Error ? e.message : e);
  }

  await sleep(5000);
  console.log("alive?", !page.isClosed(), "browser", browser.isConnected());

  if (page.isClosed()) {
    console.log("page already closed — abort");
    await browser.close().catch(() => undefined);
    process.exit(2);
  }

  for (const sel of [
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text("Accept")',
    'button[aria-label="Accept all"]',
  ]) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
      console.log("click consent", sel);
      await btn.click({ timeout: 2000 }).catch(() => undefined);
      await sleep(1500);
    }
  }

  const title = await page.title().catch(() => "");
  const feed = await page.locator('div[role="feed"]').count().catch(() => -1);
  const placeLinks = await page
    .locator('a[href*="/maps/place/"]')
    .count()
    .catch(() => -1);
  const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 1500);
  const html = await page.content().catch(() => "");

  const shot = path.join(outDir, "debug-maps.png");
  await page.screenshot({ path: shot, fullPage: false }).catch((e) =>
    console.log("screenshot fail", e instanceof Error ? e.message : e),
  );
  writeFileSync(path.join(outDir, "debug-maps-body.txt"), bodyText, "utf8");
  writeFileSync(path.join(outDir, "debug-maps.html"), html.slice(0, 200_000), "utf8");

  console.log(
    JSON.stringify(
      {
        title,
        feed,
        placeLinks,
        finalUrl: page.url(),
        shot,
        bodyPreview: bodyText.slice(0, 600),
        hasCaptcha: /unusual traffic|captcha|not a robot/i.test(bodyText + html),
        hasConsent: /before you continue|consent|accept all/i.test(bodyText + html),
      },
      null,
      2,
    ),
  );

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

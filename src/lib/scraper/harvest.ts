import type { Page } from "playwright";
import { randomUUID } from "node:crypto";
import { launchBrowser } from "./browser";
import {
  expandSearchLocations,
  queryVariants,
  resolveCities,
} from "./locations";
import type { ContactMode, Lead } from "../types";

const REQUEST_GAP_MS = 450;
const SCROLL_PAUSE_MS = 1200;
const DETAIL_PAUSE_MS = 900;
const MAX_SCROLLS = 45;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const JUNK_NAME_RE =
  /\b(tripadvisor|booking\.com|yelp|yellow\s*pages|hotels\.com|expedia|agoda|kayak|trivago|google\s*maps|facebook|instagram|linkedin|wikipedia|bayut|property\s*finder|dubizzle)\b/i;

const JUNK_HOSTS = [
  "tripadvisor.com",
  "booking.com",
  "yelp.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "wikipedia.org",
  "bayut.com",
  "propertyfinder.ae",
  "dubizzle.com",
];

type FeedCard = {
  name: string;
  href: string;
  placeKey: string;
  lat?: number;
  lng?: number;
  city?: string;
  searchQuery?: string;
};

export type HarvestParams = {
  keyword: string;
  country: string;
  city?: string;
  region?: string;
  maxResults: number;
  workers: number;
  contactMode: ContactMode;
  onProgress?: (update: {
    collected: number;
    target: number;
    message: string;
    stage: string;
    lead?: Lead;
  }) => void | Promise<void>;
  shouldCancel?: () => boolean;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function jitter(base: number) {
  return base + Math.floor(Math.random() * Math.max(120, base * 0.35));
}
function hostOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}
function isJunk(name: string, website?: string | null): boolean {
  if (JUNK_NAME_RE.test(name)) return true;
  const host = hostOf(website);
  if (!host) return false;
  return JUNK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
function extractPlaceKey(href: string): string {
  try {
    const u = new URL(href);
    const fid = u.pathname.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
    if (fid?.[1]) return fid[1].toLowerCase();
    const place = u.pathname.match(/\/maps\/place\/([^/]+)/);
    if (place?.[1]) return decodeURIComponent(place[1]).slice(0, 120);
  } catch {
    /* fallthrough */
  }
  return href.slice(0, 100);
}
function extractCoords(href: string): { lat?: number; lng?: number } {
  const m =
    href.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/) ||
    href.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (!m) return {};
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {};
  return { lat, lng };
}
function cssEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function scoreLead(lead: {
  phone?: string;
  website?: string;
  email?: string;
}, keyword: string): number {
  let score = 50;
  const gaming = /playstation|gaming|بلايستيشن|ألعاب/i.test(keyword);
  if (!gaming && !lead.website) score += 20; // website availability only, not buyer intent
  if (gaming && lead.phone) score += 20;
  if (lead.phone) score += 15;
  if (lead.website) score += 10;
  if (lead.email) score += 15;
  return Math.min(100, score);
}
function passesMode(
  mode: ContactMode,
  detail: { phone?: string; website?: string; email?: string },
): boolean {
  switch (mode) {
    case "any":
      return true;
    case "phone":
      return Boolean(detail.phone);
    case "website":
      return Boolean(detail.website);
    case "phone_website":
      return Boolean(detail.phone && detail.website);
    case "no_website":
      return !detail.website;
    case "phone_no_website":
      return Boolean(detail.phone) && !detail.website;
    default:
      return true;
  }
}

async function dismissConsent(page: Page) {
  for (const sel of [
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text("Accept")',
    'button[aria-label="Accept all"]',
  ]) {
    try {
      const btn = page.locator(sel).first();
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        await btn.click({ timeout: 1500 }).catch(() => undefined);
        await sleep(300);
        return;
      }
    } catch {
      /* next */
    }
  }
}

async function searchMaps(page: Page, query: string) {
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(jitter(1500));
  await dismissConsent(page);
  const box = page.locator("#searchboxinput").first();
  if ((await box.count().catch(() => 0)) > 0) {
    try {
      await box.click({ timeout: 2500 });
      await box.fill("");
      await box.pressSequentially(query, { delay: 25 });
      await box.press("Enter");
      await sleep(jitter(1100));
    } catch {
      /* URL enough */
    }
  }
  await page
    .locator('div[role="feed"], a[href*="/maps/place/"]')
    .first()
    .waitFor({ timeout: 22000 })
    .catch(() => undefined);
}

async function harvestFeed(page: Page, maxNeeded: number): Promise<FeedCard[]> {
  const byKey = new Map<string, FeedCard>();
  const feed = page.locator('div[role="feed"]').first();
  if ((await feed.count()) === 0) return [];

  let stagnant = 0;
  let last = 0;
  for (let i = 0; i < MAX_SCROLLS && byKey.size < maxNeeded; i++) {
    const links = page.locator('div[role="feed"] a[href*="/maps/place/"]');
    const count = await links.count();
    for (let j = 0; j < count; j++) {
      const link = links.nth(j);
      const href = (await link.getAttribute("href").catch(() => null)) ?? "";
      if (!href.includes("/maps/place/")) continue;
      const absolute = href.startsWith("http")
        ? href
        : `https://www.google.com${href}`;
      const placeKey = extractPlaceKey(absolute);
      if (byKey.has(placeKey)) continue;
      let name =
        (await link.getAttribute("aria-label").catch(() => null))?.trim() || "";
      if (!name) {
        name =
          (
            await link
              .locator(".qBF1Pd, .fontHeadlineSmall")
              .first()
              .innerText()
              .catch(() => "")
          )?.trim() || "";
      }
      if (!name || /^sponsored$/i.test(name) || isJunk(name)) continue;
      byKey.set(placeKey, {
        name,
        href: absolute.split("?")[0]!,
        placeKey,
        ...extractCoords(absolute),
      });
    }
    const end = await page
      .getByText(/you've reached the end of the list|end of the list/i)
      .count()
      .catch(() => 0);
    if (end > 0) break;
    await feed
      .evaluate((el) => el.scrollBy(0, Math.max(700, el.clientHeight * 0.95)))
      .catch(async () => page.mouse.wheel(0, 1600));
    await sleep(jitter(SCROLL_PAUSE_MS));
    if (byKey.size <= last) {
      stagnant += 1;
      if (stagnant >= 4) break;
    } else {
      stagnant = 0;
      last = byKey.size;
    }
  }
  return [...byKey.values()];
}

async function extractDetail(page: Page) {
  const out: { phone?: string; website?: string; address?: string } = {};
  const phoneBtn = page
    .locator('button[data-item-id^="phone:tel:"], a[data-item-id^="phone:tel:"]')
    .first();
  if ((await phoneBtn.count()) > 0) {
    const id = (await phoneBtn.getAttribute("data-item-id")) || "";
    out.phone =
      id.replace(/^phone:tel:/i, "").trim() ||
      ((await phoneBtn.getAttribute("aria-label")) || "")
        .replace(/^Phone:?\s*/i, "")
        .trim() ||
      undefined;
  }
  const web = page.locator('a[data-item-id="authority"]').first();
  if ((await web.count()) > 0) {
    const href = (await web.getAttribute("href")) || "";
    if (href && !/google\./i.test(href)) out.website = href.split("?")[0];
  }
  const addr = page
    .locator('button[data-item-id="address"], [data-item-id="address"]')
    .first();
  if ((await addr.count()) > 0) {
    const aria = (await addr.getAttribute("aria-label")) || "";
    out.address =
      aria.replace(/^Address:?\s*/i, "").trim() ||
      ((await addr.innerText().catch(() => "")) || "")
        .replace(/\s+/g, " ")
        .trim() ||
      undefined;
  }
  return out;
}

async function openPlaceDetail(page: Page, card: FeedCard) {
  const feedLink = page
    .locator(
      `div[role="feed"] a[href*="/maps/place/"][aria-label="${cssEscape(card.name)}"]`,
    )
    .first();
  let opened = false;
  if ((await feedLink.count().catch(() => 0)) > 0) {
    try {
      await feedLink.click({ timeout: 3500 });
      opened = true;
    } catch {
      opened = false;
    }
  }
  if (!opened) {
    await page.goto(card.href, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
  }
  await sleep(jitter(DETAIL_PAUSE_MS));
  await dismissConsent(page);
  await Promise.race([
    page.locator("h1").first().waitFor({ timeout: 7000 }).catch(() => null),
    page
      .locator('button[data-item-id^="phone:tel:"], a[data-item-id="authority"]')
      .first()
      .waitFor({ timeout: 7000 })
      .catch(() => null),
  ]);
  return extractDetail(page);
}

export async function harvestMaps(params: HarvestParams): Promise<Lead[]> {
  const keyword = params.keyword.trim();
  if (!keyword) throw new Error("Niche is required");
  const country = params.country.trim() || "Saudi Arabia";
  const limit = Math.min(Math.max(params.maxResults || 50, 1), 5000);
  const workers = Math.min(6, Math.max(1, params.workers || 2));
  const mode = params.contactMode;
  const cities = resolveCities(params);
  const locations = expandSearchLocations(cities, Math.max(limit, 200));
  const pinBudget = Math.min(
    locations.length,
    Math.max(20, Math.ceil(limit / 4) + 10),
  );
  const perLocationCap = Math.min(100, Math.max(18, Math.ceil(limit / 3)));

  const seen = new Set<string>();
  const harvested: FeedCard[] = [];
  const out: Lead[] = [];
  const enriched = new Map<
    string,
    { phone?: string; website?: string; address?: string }
  >();

  const report = async (stage: string, message: string, lead?: Lead) => {
    await params.onProgress?.({
      collected: out.length,
      target: limit,
      message,
      stage,
      lead,
    });
  };

  await report("starting", `Launching Maps · ${workers} worker(s) · target ${limit}`);

  const browser = await launchBrowser(true);
  try {
    const context = await browser.newContext({
      userAgent: UA,
      locale: "en-US",
      viewport: { width: 1365, height: 900 },
    });
    // Do not mask browser automation or bypass access restrictions.

    const pages: Page[] = [];
    for (let i = 0; i < workers; i++) {
      const p = await context.newPage();
      p.setDefaultTimeout(45000);
      p.setDefaultNavigationTimeout(60000);
      pages.push(p);
    }

    const locationQueue = locations.slice(0, pinBudget);
    let locationCursor = 0;
    let detailCursor = 0;

    async function harvestMore(page: Page, stopAt: number) {
      while (
        harvested.length < stopAt &&
        out.length < limit &&
        !params.shouldCancel?.()
      ) {
        const idx = locationCursor++;
        if (idx >= locationQueue.length) return;
        const location = locationQueue[idx]!;
        const cityGuess =
          cities.find((c) => location.toLowerCase().includes(c.toLowerCase())) ??
          location;
        let added = 0;
        for (const q of queryVariants(keyword, location).slice(0, 2)) {
          if (harvested.length >= stopAt || out.length >= limit) return;
          if (added >= perLocationCap) break;
          await sleep(jitter(REQUEST_GAP_MS));
          await report("searching", `Maps: ${q} · ${out.length}/${limit}`);
          try {
            await searchMaps(page, q);
            const cards = await harvestFeed(
              page,
              Math.min(perLocationCap - added + 25, 160),
            );
            for (const card of cards) {
              if (harvested.length >= stopAt || added >= perLocationCap) break;
              if (seen.has(card.placeKey) || isJunk(card.name)) continue;
              seen.add(card.placeKey);
              harvested.push({
                ...card,
                city: cityGuess,
                searchQuery: q,
              });
              added += 1;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/Timeout|net::|closed/i.test(msg)) continue;
            throw err;
          }
        }
      }
    }

    async function enrichPending(page: Page) {
      while (out.length < limit && !params.shouldCancel?.()) {
        const idx = detailCursor++;
        if (idx >= harvested.length) return;
        const card = harvested[idx]!;
        if (enriched.has(card.placeKey)) continue;
        try {
          const detail = await openPlaceDetail(page, card);
          enriched.set(card.placeKey, detail);
          if (out.length >= limit) return;
          if (isJunk(card.name, detail.website)) continue;
          if (!passesMode(mode, detail)) continue;
          const lead: Lead = {
            id: randomUUID(),
            name: card.name,
            phone: detail.phone,
            website: detail.website,
            address: detail.address,
            city: card.city,
            country,
            industry: keyword,
            latitude: card.lat,
            longitude: card.lng,
            mapsUrl: card.href,
            placeKey: card.placeKey,
            searchQuery: card.searchQuery,
            score: scoreLead(detail, keyword),
            collectedAt: new Date().toISOString(),
          };
          out.push(lead);
          await report(
            "collecting",
            `Qualified ${out.length}/${limit} · ${card.name}`,
            lead,
          );
          await sleep(jitter(Math.max(220, REQUEST_GAP_MS / 2)));
        } catch {
          enriched.set(card.placeKey, {});
        }
      }
    }

    let rounds = 0;
    while (out.length < limit && rounds < 12 && !params.shouldCancel?.()) {
      rounds += 1;
      const need = limit - out.length;
      const candidateTarget = Math.min(
        harvested.length + Math.max(need * 3, need + 20),
        limit * 4 + 40,
      );
      await Promise.all(pages.map((p) => harvestMore(p, candidateTarget)));
      await Promise.all(pages.map((p) => enrichPending(p)));
      if (
        locationCursor >= locationQueue.length &&
        detailCursor >= harvested.length
      ) {
        break;
      }
    }

    await Promise.all(pages.map((p) => p.close().catch(() => undefined)));
    await context.close().catch(() => undefined);
  } finally {
    await browser.close().catch(() => undefined);
  }

  await report("done", `Finished · ${out.length}/${limit} qualified leads`);
  return out.slice(0, limit).sort((a, b) => b.score - a.score);
}

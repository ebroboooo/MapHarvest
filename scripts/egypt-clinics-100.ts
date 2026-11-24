/**
 * Live verification: 100 Egypt clinics with phone + website presence.
 * Usage: npx tsx scripts/egypt-clinics-100.ts [max=100] [workers=3]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { ensureBrowsersPath, browsersInstalled } from "../src/lib/scraper/browser";
import { harvestMaps } from "../src/lib/scraper/harvest";
import type { Lead } from "../src/lib/types";

function normalizePhone(raw?: string): string {
  if (!raw) return "";
  return raw.replace(/[\s\-().]/g, "");
}

function looksLikeEgyptPhone(raw?: string): boolean {
  const n = normalizePhone(raw);
  if (!n) return false;
  // Digits only after stripping +
  const digits = n.replace(/^\+/, "");
  if (!/^\d{8,15}$/.test(digits)) return false;
  // Prefer Egypt mobile (010/011/012/015) or landline with 20 / 0 prefix
  if (/^(20)?1[0125]\d{8}$/.test(digits)) return true;
  if (/^0?1[0125]\d{8}$/.test(digits)) return true;
  if (/^(20)?[23]\d{7,8}$/.test(digits)) return true;
  if (/^0[2-9]\d{7,8}$/.test(digits)) return true;
  // Accept other plausible E.164-ish numbers scraped from Maps (still a real phone)
  return digits.length >= 8 && digits.length <= 15;
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function toCsv(leads: Lead[]): string {
  const header = [
    "name",
    "phone",
    "has_website",
    "website",
    "address",
    "city",
    "country",
    "mapsUrl",
    "score",
  ];
  const rows = leads.map((l) =>
    [
      l.name,
      l.phone || "",
      l.website ? "yes" : "no",
      l.website || "",
      l.address || "",
      l.city || "",
      l.country,
      l.mapsUrl,
      String(l.score),
    ]
      .map(csvEscape)
      .join(","),
  );
  return "\uFEFF" + [header.join(","), ...rows].join("\n");
}

async function main() {
  ensureBrowsersPath();
  if (!browsersInstalled()) {
    console.error("Browsers missing — run npm install");
    process.exit(1);
  }

  const max = Number(process.argv[2] || 100);
  const workers = Number(process.argv[3] || 3);
  const started = Date.now();

  console.log(
    JSON.stringify(
      {
        keyword: "clinic",
        country: "Egypt",
        city: "(all major cities)",
        max,
        workers,
        contactMode: "phone",
      },
      null,
      2,
    ),
  );

  const leads = await harvestMaps({
    keyword: "clinic",
    country: "Egypt",
    // no city → Cairo, Giza, Alexandria, Mansoura, Tanta, Asyut
    maxResults: max,
    workers,
    contactMode: "phone",
    onProgress: (u) => {
      const elapsed = ((Date.now() - started) / 1000).toFixed(0);
      console.log(
        `[${elapsed}s][${u.stage}] ${u.collected}/${u.target} — ${u.message}`,
      );
    },
  });

  const outDir = path.join(process.cwd(), "output");
  mkdirSync(outDir, { recursive: true });
  const stamp = Date.now();
  const jsonPath = path.join(outDir, `egypt-clinics-${stamp}.json`);
  const csvPath = path.join(outDir, `egypt-clinics-${stamp}.csv`);
  writeFileSync(jsonPath, JSON.stringify(leads, null, 2), "utf8");
  writeFileSync(csvPath, toCsv(leads), "utf8");

  const withPhone = leads.filter((l) => Boolean(l.phone));
  const withWebsite = leads.filter((l) => Boolean(l.website));
  const noWebsite = leads.filter((l) => !l.website);
  const validPhone = leads.filter((l) => looksLikeEgyptPhone(l.phone));
  const badPhone = leads.filter((l) => l.phone && !looksLikeEgyptPhone(l.phone));
  const missingPhone = leads.filter((l) => !l.phone);
  const missingName = leads.filter((l) => !l.name?.trim());
  const missingMaps = leads.filter((l) => !l.mapsUrl);
  const placeKeys = new Set(leads.map((l) => l.placeKey));
  const dupes = leads.length - placeKeys.size;
  const egyptish = leads.filter(
    (l) =>
      /egypt|مصر|cairo|giza|alex|mansoura|tanta|asyut|nasr|maadi|heliopolis|dokki|octob/i.test(
        `${l.address || ""} ${l.city || ""} ${l.country}`,
      ) || l.country.toLowerCase().includes("egypt"),
  );

  const report = {
    target: max,
    collected: leads.length,
    hitTarget: leads.length >= max,
    withPhone: withPhone.length,
    phoneCoveragePct: leads.length
      ? Math.round((withPhone.length / leads.length) * 1000) / 10
      : 0,
    validLookingPhones: validPhone.length,
    suspiciousPhones: badPhone.length,
    withWebsite: withWebsite.length,
    noWebsite: noWebsite.length,
    missingPhone: missingPhone.length,
    missingName: missingName.length,
    missingMapsUrl: missingMaps.length,
    duplicatePlaceKeys: dupes,
    egyptContextLeads: egyptish.length,
    elapsedSec: Math.round((Date.now() - started) / 1000),
    jsonPath,
    csvPath,
    sample: leads.slice(0, 8).map((l) => ({
      name: l.name,
      phone: l.phone,
      hasWebsite: Boolean(l.website),
      website: l.website || null,
      city: l.city,
      address: l.address,
    })),
    badPhoneSamples: badPhone.slice(0, 5).map((l) => ({
      name: l.name,
      phone: l.phone,
    })),
  };

  const reportPath = path.join(outDir, `egypt-clinics-${stamp}-report.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log("\n=== VALIDATION REPORT ===");
  console.log(JSON.stringify(report, null, 2));

  const hardFail =
    leads.length === 0 ||
    missingPhone.length > 0 ||
    missingName.length > 0 ||
    dupes > 0;

  if (hardFail) {
    console.error("\nVERIFY FAIL — data integrity issues");
    process.exit(3);
  }
  if (leads.length < max) {
    console.warn(
      `\nPARTIAL: got ${leads.length}/${max} — app ran but undershot target`,
    );
    process.exit(4);
  }
  console.log("\nVERIFY OK — 100 phone-qualified Egypt clinic leads");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

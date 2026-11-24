import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { ensureBrowsersPath, browsersInstalled } from "../src/lib/scraper/browser";
import { harvestMaps } from "../src/lib/scraper/harvest";
import type { ContactMode } from "../src/lib/types";

async function main() {
  ensureBrowsersPath();
  if (!browsersInstalled()) {
    console.error("Browsers missing — run npm install");
    process.exit(1);
  }

  const keyword = process.argv[2] || "cafe";
  const country = process.argv[3] || "Saudi Arabia";
  // Pass "-" or "all" for country-wide city list (do not default to Riyadh).
  const cityArg = process.argv[4];
  const city =
    !cityArg || cityArg === "-" || /^all$/i.test(cityArg)
      ? undefined
      : cityArg;
  const max = Number(process.argv[5] || 8);
  const mode = (process.argv[6] as ContactMode) || "phone";

  console.log({ keyword, country, city: city || "(all major cities)", max, mode });

  const leads = await harvestMaps({
    keyword,
    country,
    city,
    maxResults: max,
    workers: 2,
    contactMode: mode,
    onProgress: (u) => {
      console.log(`[${u.stage}] ${u.collected}/${u.target} — ${u.message}`);
    },
  });

  console.log(`\nRESULT: ${leads.length} leads`);
  for (const l of leads) {
    console.log(`- ${l.name} | ${l.phone || "—"} | ${l.website || "—"}`);
  }

  const outDir = path.join(process.cwd(), "output");
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `verify-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(leads, null, 2), "utf8");
  console.log(`\nWrote ${file}`);

  if (leads.length === 0) process.exit(2);
  if (mode === "phone" && leads.some((l) => !l.phone)) {
    console.error("FAIL: phone mode returned leads without phone");
    process.exit(3);
  }
  console.log("VERIFY OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: tsx scripts/validate-leads.ts <json>");
  process.exit(1);
}

const leads = JSON.parse(readFileSync(file, "utf8")) as Array<{
  name: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  mapsUrl: string;
  placeKey: string;
  latitude?: number;
  longitude?: number;
}>;

const phones = new Map<string, string>();
const dupPhones: Array<{ name: string; phone: string; other: string }> = [];
for (const l of leads) {
  const p = (l.phone || "").replace(/\s/g, "");
  if (!p) continue;
  if (phones.has(p)) {
    dupPhones.push({ name: l.name, phone: p, other: phones.get(p)! });
  } else {
    phones.set(p, l.name);
  }
}

const cities: Record<string, number> = {};
for (const l of leads) {
  const c = l.city || "?";
  cities[c] = (cities[c] || 0) + 1;
}

const digitLen = (p?: string) => (p || "").replace(/\D/g, "").length;
const mobile = leads.filter((l) =>
  /^(?:\+?20)?0?1[0125]\d{8}$/.test((l.phone || "").replace(/[\s\-]/g, "")),
).length;
const shortish = leads.filter((l) => digitLen(l.phone) > 0 && digitLen(l.phone) <= 8).length;

console.log(
  JSON.stringify(
    {
      total: leads.length,
      uniquePlaceKeys: new Set(leads.map((l) => l.placeKey)).size,
      uniquePhones: phones.size,
      duplicatePhoneRows: dupPhones.length,
      duplicatePhoneSamples: dupPhones.slice(0, 8),
      cities,
      withAddress: leads.filter((l) => l.address).length,
      withCoords: leads.filter((l) => l.latitude != null && l.longitude != null)
        .length,
      mobileLike: mobile,
      shortHotlineLike: shortish,
      withWebsite: leads.filter((l) => l.website).length,
      noWebsite: leads.filter((l) => !l.website).length,
      everyHasNamePhoneMaps: leads.every(
        (l) => l.name && l.phone && l.mapsUrl,
      ),
      websiteSamples: leads
        .filter((l) => l.website)
        .slice(0, 5)
        .map((l) => ({ name: l.name, phone: l.phone, website: l.website })),
      noWebsiteSamples: leads
        .filter((l) => !l.website)
        .slice(0, 5)
        .map((l) => ({ name: l.name, phone: l.phone, hasWebsite: false })),
      shortPhoneSamples: leads
        .filter((l) => digitLen(l.phone) > 0 && digitLen(l.phone) <= 8)
        .map((l) => ({ name: l.name, phone: l.phone })),
    },
    null,
    2,
  ),
);

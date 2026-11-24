const COUNTRY_CITIES: Record<string, string[]> = {
  "saudi arabia": [
    "Riyadh",
    "Jeddah",
    "Dammam",
    "Khobar",
    "Mecca",
    "Medina",
    "Taif",
    "Abha",
    "Tabuk",
    "Jubail",
  ],
  "united arab emirates": [
    "Dubai",
    "Abu Dhabi",
    "Sharjah",
    "Ajman",
    "Ras Al Khaimah",
  ],
  egypt: [
    "Cairo",
    "Giza",
    "Alexandria",
    "Mansoura",
    "Tanta",
    "Asyut",
    "Ismailia",
    "Port Said",
    "Suez",
    "Zagazig",
    "Damietta",
    "Luxor",
    "Aswan",
    "Hurghada",
    "Sharm El Sheikh",
    "Minya",
    "Beni Suef",
    "Fayoum",
    "Sohag",
    "Qena",
  ],
  "united states": [
    "Los Angeles",
    "New York",
    "Houston",
    "Miami",
    "Chicago",
    "San Diego",
  ],
};

const CITY_DISTRICTS: Record<string, string[]> = {
  riyadh: ["Olaya", "Al Malaz", "Al Yasmin", "Al Sahafa", "Al Nakheel"],
  jeddah: ["Al Balad", "Al Rawdah", "Corniche", "Obhur", "Al Hamra"],
  dubai: ["Dubai Marina", "Jumeirah", "Deira", "Business Bay", "JLT"],
  cairo: [
    "Nasr City",
    "Maadi",
    "Heliopolis",
    "Zamalek",
    "New Cairo",
    "Mohandessin",
    "Shubra",
    "Helwan",
    "Fifth Settlement",
  ],
  giza: ["Dokki", "Mohandessin", "6th of October", "Sheikh Zayed", "Haram"],
  alexandria: ["Smouha", "Gleem", "Stanley", "Miami", "Agami"],
  mansoura: ["Talkha", "University", "Gehan Street"],
};

export function resolveCities(input: {
  country: string;
  city?: string;
  region?: string;
}): string[] {
  const country = input.country.trim().toLowerCase();
  if (input.city?.trim()) return [input.city.trim()];
  if (input.region?.trim()) {
    const short = input.region
      .replace(/\s*Region\b/i, "")
      .replace(/\s*\(.*\)\s*/g, "")
      .trim();
    return short ? [short] : [input.region.trim()];
  }
  for (const [key, cities] of Object.entries(COUNTRY_CITIES)) {
    if (country.includes(key) || key.includes(country)) return cities;
  }
  return [input.country.trim() || "Saudi Arabia"];
}

export function expandSearchLocations(cities: string[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (label: string) => {
    const k = label.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(label);
  };
  for (const city of cities) {
    push(city);
    const districts = CITY_DISTRICTS[city.toLowerCase()];
    if (!districts) continue;
    const take = limit >= 300 ? districts.length : limit >= 100 ? 5 : 3;
    for (const d of districts.slice(0, take)) push(`${d} ${city}`);
  }
  return out;
}

export function queryVariants(keyword: string, location: string): string[] {
  const k = keyword.trim();
  const base = [`${k} ${location}`, `${k} near ${location}`];
  if (/cater|تموين|كاترينج/i.test(k)) {
    base.push(
      `catering company ${location}`,
      `catering service ${location}`,
      `شركة تموين ${location}`,
      `خدمات كاترينج ${location}`,
    );
  }
  if (/maid|clean|housekeep|خادم|عاملات|تنظيف/i.test(k)) {
    base.push(
      `maid service ${location}`,
      `cleaning company ${location}`,
      `شركة تنظيف ${location}`,
    );
  }
  if (/real\s*estate|realtor|عقارات/i.test(k)) {
    base.push(
      `real estate agency ${location}`,
      `مكتب عقارات ${location}`,
    );
  }
  if (/cafe|coffee|مقهى/i.test(k)) {
    base.push(`cafe ${location}`, `coffee shop ${location}`);
  }
  if (/dentist|dental|اسنان/i.test(k)) {
    base.push(`dental clinic ${location}`, `dentist ${location}`);
  }
  if (/clinic|عياد/i.test(k)) {
    base.push(
      `medical clinic ${location}`,
      `عيادة ${location}`,
      `عيادات طبية ${location}`,
    );
  }
  return [...new Set(base)];
}

export const COUNTRY_OPTIONS = [
  "Saudi Arabia",
  "United Arab Emirates",
  "Egypt",
  "United States",
] as const;

export const NICHE_OPTIONS = [
  { group: "Food & hospitality", items: ["cafe", "restaurant", "catering company", "bakery", "hotel"] },
  { group: "Home services", items: ["cleaning company", "maid service", "laundry", "pest control"] },
  { group: "Health", items: ["dentist", "dental clinic", "pharmacy", "clinic"] },
  { group: "Business", items: ["real estate agency", "law firm", "accounting firm", "marketing agency"] },
  { group: "Beauty & fitness", items: ["salon", "barber", "gym", "spa"] },
  { group: "Auto & trade", items: ["car wash", "auto repair", "construction company"] },
] as const;

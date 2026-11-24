# MapHarvest (C:\MapHarvest)

Clean professional **Google Maps → leads** app. Playwright only. No paid Places API. No Wikidata noise.

## Run

```bash
cd C:\MapHarvest
npm install
npm run dev
```

Open **http://localhost:3030**

## What it does

1. Opens Google Maps
2. Searches niche + related keywords by city
3. Scrolls results and opens place panels
4. Keeps collecting until your **qualified** target is filled
5. Live progress bar = collected / target
6. Contact filters: phone, website, both, no-website (hot), etc.
7. Worker slider for laptop load vs speed
8. CSV export (UTF-8 BOM — Arabic safe)

## Notes

- Browsers install under `C:\MapHarvest\.playwright-browsers` (or junction to E: if already present)
- Default headless (stable)

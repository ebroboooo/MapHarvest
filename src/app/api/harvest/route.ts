import { NextResponse } from "next/server";
import { startJob, listJobs } from "@/lib/jobs";
import type { ContactMode } from "@/lib/types";
import { browsersInstalled, ensureBrowsersPath } from "@/lib/scraper/browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODES: ContactMode[] = [
  "any",
  "phone",
  "website",
  "phone_website",
  "no_website",
  "phone_no_website",
];

export async function GET() {
  ensureBrowsersPath();
  return NextResponse.json({
    jobs: listJobs().slice(0, 20),
    browsersReady: browsersInstalled(),
  });
}

export async function POST(request: Request) {
  ensureBrowsersPath();
  if (!browsersInstalled()) {
    return NextResponse.json(
      { error: "Playwright Chromium missing. Run npm install." },
      { status: 503 },
    );
  }

  const body = await request.json();
  const keyword = String(body.keyword ?? "").trim();
  const country = String(body.country ?? "Saudi Arabia").trim();
  if (!keyword) {
    return NextResponse.json({ error: "Select a niche" }, { status: 400 });
  }

  const contactMode = MODES.includes(body.contactMode)
    ? (body.contactMode as ContactMode)
    : "any";

  const job = await startJob({
    keyword,
    country,
    city: body.city ? String(body.city) : undefined,
    region: body.region ? String(body.region) : undefined,
    maxResults: Number(body.maxResults) || 50,
    workers: Number(body.workers) || 2,
    contactMode,
  });

  return NextResponse.json({ job });
}

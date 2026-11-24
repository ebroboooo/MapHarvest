import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { HarvestJob, StartHarvestInput } from "./types";
import { harvestMaps } from "./scraper/harvest";
import { ensureBrowsersPath } from "./scraper/browser";

const DATA_DIR = path.join(process.cwd(), "data");
const JOBS_DIR = path.join(DATA_DIR, "jobs");

const jobs = new Map<string, HarvestJob>();
const cancelFlags = new Set<string>();
const listeners = new Map<string, Set<(job: HarvestJob) => void>>();

function ensureDirs() {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

function persist(job: HarvestJob) {
  ensureDirs();
  fs.writeFileSync(
    path.join(JOBS_DIR, `${job.id}.json`),
    JSON.stringify(job, null, 2),
    "utf8",
  );
}

function emit(job: HarvestJob) {
  jobs.set(job.id, job);
  persist(job);
  const set = listeners.get(job.id);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(job);
    } catch {
      /* ignore */
    }
  }
}

export function subscribe(jobId: string, fn: (job: HarvestJob) => void) {
  if (!listeners.has(jobId)) listeners.set(jobId, new Set());
  listeners.get(jobId)!.add(fn);
  return () => listeners.get(jobId)?.delete(fn);
}

export function getJob(id: string): HarvestJob | undefined {
  if (jobs.has(id)) return jobs.get(id);
  const file = path.join(JOBS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return undefined;
  try {
    const job = JSON.parse(fs.readFileSync(file, "utf8")) as HarvestJob;
    jobs.set(id, job);
    return job;
  } catch {
    return undefined;
  }
}

export function listJobs(): HarvestJob[] {
  ensureDirs();
  const ids = new Set<string>([
    ...jobs.keys(),
    ...fs
      .readdirSync(JOBS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, "")),
  ]);
  return [...ids]
    .map((id) => getJob(id))
    .filter((j): j is HarvestJob => Boolean(j))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function cancelJob(id: string) {
  cancelFlags.add(id);
  const job = getJob(id);
  if (job && (job.status === "running" || job.status === "queued")) {
    emit({
      ...job,
      status: "cancelled",
      updatedAt: new Date().toISOString(),
      progress: {
        ...job.progress,
        message: "Cancelled by user",
        stage: "cancelled",
      },
    });
  }
}

export async function startJob(input: StartHarvestInput): Promise<HarvestJob> {
  ensureBrowsersPath();
  const now = new Date().toISOString();
  const job: HarvestJob = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: "queued",
    keyword: input.keyword.trim(),
    country: input.country.trim(),
    city: input.city?.trim() || undefined,
    region: input.region?.trim() || undefined,
    maxResults: Math.min(Math.max(input.maxResults || 50, 1), 5000),
    workers: Math.min(6, Math.max(1, input.workers || 2)),
    contactMode: input.contactMode,
    progress: {
      collected: 0,
      target: Math.min(Math.max(input.maxResults || 50, 1), 5000),
      percent: 0,
      message: "Queued…",
      stage: "queued",
    },
    leads: [],
  };
  emit(job);

  // Fire and forget — progress streams via subscribe / poll
  void runJob(job.id);
  return job;
}

async function runJob(id: string) {
  const current = getJob(id);
  if (!current) return;
  emit({
    ...current,
    status: "running",
    updatedAt: new Date().toISOString(),
    progress: {
      ...current.progress,
      message: "Starting Google Maps…",
      stage: "starting",
    },
  });

  try {
    const leads = await harvestMaps({
      keyword: current.keyword,
      country: current.country,
      city: current.city,
      region: current.region,
      maxResults: current.maxResults,
      workers: current.workers,
      contactMode: current.contactMode,
      shouldCancel: () => cancelFlags.has(id),
      onProgress: async (update) => {
        if (cancelFlags.has(id)) return;
        const latest = getJob(id);
        if (!latest || latest.status === "cancelled") return;
        const percent = Math.min(
          99,
          Math.round((update.collected / Math.max(update.target, 1)) * 100),
        );
        const leads =
          update.lead && !latest.leads.some((l) => l.placeKey === update.lead!.placeKey)
            ? [...latest.leads, update.lead]
            : latest.leads;
        emit({
          ...latest,
          updatedAt: new Date().toISOString(),
          leads,
          progress: {
            collected: update.collected,
            target: update.target,
            percent,
            message: update.message,
            stage: update.stage,
          },
        });
      },
    });

    if (cancelFlags.has(id)) {
      cancelFlags.delete(id);
      return;
    }

    const latest = getJob(id)!;
    emit({
      ...latest,
      status: "completed",
      updatedAt: new Date().toISOString(),
      leads,
      progress: {
        collected: leads.length,
        target: latest.maxResults,
        percent: 100,
        message: `Done · ${leads.length} leads`,
        stage: "completed",
      },
    });
  } catch (err) {
    const latest = getJob(id);
    if (!latest) return;
    emit({
      ...latest,
      status: "failed",
      updatedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      progress: {
        ...latest.progress,
        message: err instanceof Error ? err.message : String(err),
        stage: "failed",
      },
    });
  } finally {
    cancelFlags.delete(id);
  }
}

export function leadsToCsv(leads: HarvestJob["leads"]): string {
  const cols = [
    "name",
    "phone",
    "website",
    "email",
    "address",
    "city",
    "country",
    "industry",
    "score",
    "mapsUrl",
  ] as const;
  const esc = (v: string | number | undefined) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [cols.join(",")];
  for (const lead of leads) {
    lines.push(cols.map((c) => esc(lead[c] as string | number | undefined)).join(","));
  }
  return `\uFEFF${lines.join("\n")}`;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { ProgressBar } from "@/components/progress-bar";
import { SalesProspects } from "@/components/sales-prospects";
import { COUNTRY_OPTIONS, NICHE_OPTIONS } from "@/lib/scraper/locations";
import type { ContactMode, HarvestJob } from "@/lib/types";
import { cn } from "@/lib/utils";

const CONTACT_OPTIONS: Array<{
  value: ContactMode;
  title: string;
  hint: string;
}> = [
  { value: "any", title: "Any contact", hint: "All matching businesses" },
  { value: "phone", title: "Phone", hint: "Must include phone" },
  { value: "website", title: "Website", hint: "Must include website" },
  { value: "phone_website", title: "Phone + website", hint: "Both required" },
  { value: "no_website", title: "No website", hint: "No site listed" },
  {
    value: "phone_no_website",
    title: "Phone · no website",
    hint: "Phone listed; no site listed",
  },
];

const MAX_OPTIONS = [25, 50, 100, 250, 500, 1000];

export function HarvestApp() {
  const [keyword, setKeyword] = useState("");
  const [customKeyword, setCustomKeyword] = useState("");
  const [country, setCountry] = useState("Saudi Arabia");
  const [city, setCity] = useState("");
  const [maxResults, setMaxResults] = useState(50);
  const [workers, setWorkers] = useState(2);
  const [contactMode, setContactMode] = useState<ContactMode>("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<HarvestJob | null>(null);
  const [browsersReady, setBrowsersReady] = useState(true);
  const [clock,setClock] = useState(Date.now());
  const [connected,setConnected] = useState(false);
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);

  useEffect(() => {
    fetch("/api/harvest")
      .then((r) => r.json())
      .then((d) => {setBrowsersReady(Boolean(d.browsersReady)); setJob(prev=>prev??d.jobs?.[0]??null);})
      .catch(() => setBrowsersReady(false));
  }, []);

  useEffect(() => {
    if (!job?.id) return;
    if (job.status !== "running" && job.status !== "queued") return;

    const accept = (incoming: HarvestJob) => setJob(prev => prev?.id === incoming.id && prev.updatedAt > incoming.updatedAt ? prev : incoming);
    let disposed=false;
    const pull = () =>
      fetch(`/api/harvest/${job.id}`)
        .then((r) => r.json())
        .then((d) => {if (!disposed && d.job) {accept(d.job as HarvestJob);setConnected(true);}})
        .catch(() => {if(!disposed)setConnected(false);});

    const es = new EventSource(`/api/harvest/${job.id}/stream`);
    es.onopen=()=>setConnected(true);
    es.onerror=()=>setConnected(false);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (!disposed && data.job) {accept(data.job as HarvestJob);setConnected(true);}
      } catch {
        /* ignore */
      }
    };

    void pull();
    const poll = setInterval(pull, 1500);
    return () => {
      disposed=true;
      es.close();
      clearInterval(poll);
    };
  }, [job?.id, job?.status]);

  const running = job?.status === "running" || job?.status === "queued";

  const stats = useMemo(() => {
    const leads = job?.leads ?? [];
    return {
      withPhone: leads.filter((l) => l.phone).length,
      withWeb: leads.filter((l) => l.website).length,
      noWeb: leads.filter((l) => !l.website).length,
    };
  }, [job?.leads]);

  async function onStart(e: React.FormEvent) {
    e.preventDefault();
    const selectedKeyword = (keyword === "__custom" ? customKeyword : keyword).trim();
    if (!selectedKeyword) {
      setError("Choose a business niche");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/harvest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: selectedKeyword,
          country,
          city: city || undefined,
          maxResults,
          workers,
          contactMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      setJob(data.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!job) return;
    try { const res=await fetch(`/api/harvest/${job.id}`, { method: "DELETE" }); if(!res.ok)throw Error("Cancel failed"); const next=await fetch(`/api/harvest/${job.id}`).then(r=>r.json()); if(next.job)setJob(next.job); } catch(e){setError(e instanceof Error?e.message:"Cancel failed");}
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8 text-center sm:mb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-tide-700">
          MapHarvest
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl">
          MapHarvest · Sales Command Center
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ink-700/70">
          Pick a niche, location, and what contact info you need. Watch leads
          fill live — then export CSV. Use only data sources you have permission to collect from.
        </p>
      </header>

      <div className="mb-5 rounded-xl border bg-white p-4 text-sm">
        <strong>LoungeLink POS campaign</strong>
        <p className="my-2">Use the sales workspace below to track verified public business listings. A listing is not a confirmed buyer.</p>
        <button type="button" disabled={busy || running} onClick={()=>{setKeyword("playstation gaming lounge");setCountry("Egypt");setCity("Cairo");setContactMode("phone");setMaxResults(25);setWorkers(1);}} className="rounded-lg bg-ink-950 px-4 py-2 text-white disabled:opacity-50">Set LoungeLink search filters</button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_0.92fr]">
        <form
          onSubmit={onStart}
          className="rounded-[28px] border border-ink-900/10 bg-white/85 p-6 shadow-panel backdrop-blur sm:p-7"
        >
          <ol className="space-y-6">
            <li className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-950 text-[11px] font-bold text-sand-50">
                  1
                </span>
                <span className="text-sm font-semibold text-ink-950">
                  What business?
                </span>
              </div>
              <select
                className="h-12 w-full rounded-xl border border-ink-900/10 bg-sand-50 px-3 text-sm outline-none ring-tide-500 focus:ring-2"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                required
              >
                <option value="" disabled>
                  Select niche…
                </option>
                <option value="__custom">Custom business keyword…</option>
                {NICHE_OPTIONS.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.items.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {keyword === "__custom" && <input required maxLength={100} className="h-12 w-full rounded-xl border bg-sand-50 px-3 text-sm" placeholder="e.g. PlayStation cafe or بلايستيشن" value={customKeyword} onChange={e=>setCustomKeyword(e.target.value)}/>}
            </li>

            <li className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-950 text-[11px] font-bold text-sand-50">
                  2
                </span>
                <span className="text-sm font-semibold text-ink-950">
                  Where?
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className="h-12 w-full rounded-xl border border-ink-900/10 bg-sand-50 px-3 text-sm outline-none ring-tide-500 focus:ring-2"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  className="h-12 w-full rounded-xl border border-ink-900/10 bg-sand-50 px-3 text-sm outline-none ring-tide-500 focus:ring-2"
                  placeholder="City (optional)"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
            </li>

            <li className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-950 text-[11px] font-bold text-sand-50">
                  3
                </span>
                <span className="text-sm font-semibold text-ink-950">
                  What contact info?
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {CONTACT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setContactMode(opt.value)}
                    className={cn(
                      "rounded-2xl border px-3 py-3 text-left transition",
                      contactMode === opt.value
                        ? "border-tide-500 bg-tide-500/10 ring-1 ring-tide-500/30"
                        : "border-ink-900/10 bg-sand-50/80 hover:border-ink-900/20",
                    )}
                  >
                    <div className="text-sm font-semibold text-ink-950">
                      {opt.title}
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-700/60">
                      {opt.hint}
                    </div>
                  </button>
                ))}
              </div>
            </li>

            <li className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-950 text-[11px] font-bold text-sand-50">
                  4
                </span>
                <span className="text-sm font-semibold text-ink-950">
                  How many · how fast?
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  className="h-12 w-full rounded-xl border border-ink-900/10 bg-sand-50 px-3 text-sm outline-none ring-tide-500 focus:ring-2"
                  value={maxResults}
                  onChange={(e) => setMaxResults(Number(e.target.value))}
                >
                  {MAX_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} leads
                    </option>
                  ))}
                </select>
                <div className="rounded-xl border border-ink-900/10 bg-sand-50 px-3 py-2">
                  <div className="flex justify-between text-xs text-ink-700/60">
                    <span>Gentle</span>
                    <span className="font-semibold text-ink-900">
                      {workers} workers
                    </span>
                    <span>Fast</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={6}
                    value={workers}
                    onChange={(e) => setWorkers(Number(e.target.value))}
                    className="mt-2 w-full accent-tide-600"
                  />
                </div>
              </div>
            </li>
          </ol>

          {!browsersReady ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Browsers not ready. Run <code>npm install</code> in C:\MapHarvest.
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy || running || !browsersReady}
              className="h-12 min-w-[180px] rounded-xl bg-ink-950 px-6 text-sm font-semibold text-sand-50 transition hover:bg-ink-800 disabled:opacity-50"
            >
              {busy || running ? "Searching…" : "Start search"}
            </button>
            {running ? (
              <button
                type="button"
                onClick={onCancel}
                className="h-12 rounded-xl border border-ink-900/15 bg-white px-5 text-sm font-semibold"
              >
                Stop
              </button>
            ) : null}
            {job && job.leads.length > 0 ? (
              <a
                href={`/api/harvest/${job.id}?format=csv`}
                className="inline-flex h-12 items-center rounded-xl border border-tide-600/30 bg-tide-500/10 px-5 text-sm font-semibold text-tide-700"
              >
                Download CSV
              </a>
            ) : null}
          </div>
        </form>

        <aside className="rounded-[28px] border border-ink-900/10 bg-ink-950 p-6 text-sand-50 shadow-panel sm:p-7">
          <h2 className="font-display text-2xl font-semibold">Live search monitor</h2>
          {!job ? (
            <p className="mt-3 text-sm text-sand-200/65">
              Your progress bar and leads appear here when you start.
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              <ProgressBar
                collected={job.progress.collected}
                target={job.progress.target}
                running={running}
              />
              <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white/10 px-3 py-1">{job.status.toUpperCase()}</span><span className="rounded-full bg-white/10 px-3 py-1">{running ? (connected?"Connected":"Connecting / reconnecting"):"Stopped"}</span><span className="rounded-full bg-white/10 px-3 py-1">{Math.max(0,Math.floor(((running?clock:Date.parse(job.updatedAt))-Date.parse(job.createdAt))/1000))}s elapsed</span></div>
              <p className="text-sm text-sand-100/75" role="status">{job.progress.message}</p>
              {running && clock-Date.parse(job.updatedAt)>30000 && <p className="rounded-lg bg-amber-500/15 p-2 text-xs text-amber-200">No new activity for {Math.floor((clock-Date.parse(job.updatedAt))/1000)}s. Browser may be waiting for a page or network response.</p>}
              {job.progress.metrics && <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">{[
                ["Queries finished",job.progress.metrics.queriesFinished+" / "+job.progress.metrics.queriesStarted],
                ["Unique queued",job.progress.metrics.candidates],
                ["Inspected",job.progress.metrics.inspected],
                ["Filtered",job.progress.metrics.filtered],
                ["Duplicates skipped",job.progress.metrics.duplicates],
                ["Errors",job.progress.metrics.errors]
              ].map(([label,value])=><div key={label} className="rounded-xl bg-white/10 p-2"><div className="text-lg font-semibold">{value}</div><div className="text-xs text-sand-200/70">{label}</div></div>)}</div>}
              <div className="rounded-xl border border-white/10 bg-black/20 p-3"><h3 className="mb-2 text-sm font-semibold">Live activity</h3><div className="max-h-52 overflow-y-auto space-y-2 font-mono text-xs">{(job.progress.events??[]).slice().reverse().map((event,i)=><div key={event.at+"-"+i} className="border-b border-white/5 pb-1"><span className="text-sand-200/60">{new Date(event.at).toLocaleTimeString()} · {event.stage}</span><div className="break-words">{event.message}</div></div>)}</div>{!job.progress.events?.length&&<p className="text-xs text-sand-200/60">Activity details appear once a new search begins.</p>}</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-white/5 py-3">
                  <div className="text-lg font-semibold">{stats.withPhone}</div>
                  <div className="text-[10px] uppercase tracking-wide text-sand-200/50">
                    Phone
                  </div>
                </div>
                <div className="rounded-2xl bg-white/5 py-3">
                  <div className="text-lg font-semibold">{stats.withWeb}</div>
                  <div className="text-[10px] uppercase tracking-wide text-sand-200/50">
                    Website
                  </div>
                </div>
                <div className="rounded-2xl bg-white/5 py-3">
                  <div className="text-lg font-semibold">{stats.noWeb}</div>
                  <div className="text-[10px] uppercase tracking-wide text-sand-200/50">
                    No site
                  </div>
                </div>
              </div>
              <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
                {(job.leads ?? [])
                  .slice()
                  .reverse()
                  .map((lead) => (
                    <div
                      key={lead.id}
                      className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5"
                    >
                      <div className="flex justify-between gap-2">
                        <p className="text-sm font-medium leading-snug">
                          {lead.name}
                        </p>
                        <span className="shrink-0 text-[10px] text-tide-300">
                          {lead.score}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-sand-200/60">
                        {[lead.phone, lead.website ? "website" : null, lead.city]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {job && job.leads.length > 0 ? (
        <section className="mt-5 overflow-hidden rounded-[28px] border border-ink-900/10 bg-white/85 shadow-panel backdrop-blur">
          <div className="flex items-center justify-between border-b border-ink-900/10 px-5 py-4">
            <h3 className="font-display text-xl font-semibold text-ink-950">
              All leads
            </h3>
            <span className="text-xs text-ink-700/55">{job.leads.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-sand-100/80 text-xs uppercase tracking-wide text-ink-700/50">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Website</th>
                  <th className="px-4 py-3">City</th>
                </tr>
              </thead>
              <tbody>
                {job.leads.map((lead) => (
                  <tr key={lead.id} className="border-t border-ink-900/5">
                    <td className="px-4 py-3 font-medium">
                      <a
                        className="hover:text-tide-700 hover:underline"
                        href={lead.mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {lead.name}
                      </a>
                    </td>
                    <td className="px-4 py-3">{lead.phone || "—"}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-xs">
                      {lead.website || "—"}
                    </td>
                    <td className="px-4 py-3">{lead.city || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <SalesProspects />
    </div>
  );
}

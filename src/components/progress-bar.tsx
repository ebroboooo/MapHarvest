"use client";

import { cn } from "@/lib/utils";

export function ProgressBar({
  collected,
  target,
  running,
  className,
}: {
  collected: number;
  target: number;
  running?: boolean;
  className?: string;
}) {
  const pct = Math.min(
    100,
    Math.round((Math.max(0, collected) / Math.max(1, target)) * 100),
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sand-200/70">
            Leads collected
          </p>
          <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-sand-50">
            {Math.min(collected, target)}
            <span className="mx-1 text-xl font-medium text-sand-200/60">/</span>
            {target}
          </p>
        </div>
        <p className="font-mono text-sm tabular-nums text-sand-100">{pct}%</p>
      </div>
      <div role="progressbar" aria-label="Qualified leads collected" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-3 overflow-hidden rounded-full bg-white/15 ring-1 ring-white/10">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            running ? "progress-live" : "bg-tide-600",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

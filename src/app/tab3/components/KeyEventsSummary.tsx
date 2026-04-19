"use client";

import { useMemo } from "react";
import type { AnalysisEvent, Severity } from "@/app/lib/types";
import SeverityBadge from "@/app/tab2/components/SeverityBadge";

interface Props {
  events: AnalysisEvent[];
}

interface SummaryRow {
  key: string;
  firstAt: string;
  latestAt: string;
  count: number;
  severity: Severity;
  patientLabel: string;
  eventType: string;
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function sentenceCase(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const SEVERITY_RANK: Record<Severity, number> = {
  normal: 0,
  low: 1,
  moderate: 2,
  urgent: 3,
  critical: 4,
};

const DEDUPE_WINDOW_MS = 60_000;

export default function KeyEventsSummary({ events }: Props) {
  const rows = useMemo<SummaryRow[]>(() => {
    const filtered = events
      .filter((e) => e.severity === "critical" || e.severity === "urgent")
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const out: SummaryRow[] = [];
    for (const e of filtered) {
      const t = new Date(e.createdAt).getTime();
      const key = `${e.patientLabel}\u0000${e.eventType}`;
      const prior = [...out].reverse().find((r) => r.key === key);
      if (prior && t - new Date(prior.latestAt).getTime() <= DEDUPE_WINDOW_MS) {
        prior.count += 1;
        prior.latestAt = e.createdAt;
        if (SEVERITY_RANK[e.severity] > SEVERITY_RANK[prior.severity]) {
          prior.severity = e.severity;
        }
      } else {
        out.push({
          key,
          firstAt: e.createdAt,
          latestAt: e.createdAt,
          count: 1,
          severity: e.severity,
          patientLabel: e.patientLabel,
          eventType: e.eventType,
        });
      }
    }
    return out.reverse();
  }, [events]);

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-white/10 bg-[#0c0c12] px-3 py-4 text-center text-xs text-slate-500">
        No critical or urgent events yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div
          key={`${r.key}-${r.firstAt}`}
          className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-[#0c0c12] px-3 py-2"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="font-mono text-[11px] text-slate-500">
              {formatClock(r.latestAt)}
            </span>
            <span className="truncate text-sm font-medium text-white">{r.patientLabel}</span>
            <span className="truncate text-xs text-slate-400">{sentenceCase(r.eventType)}</span>
            {r.count > 1 && (
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
                ×{r.count}
              </span>
            )}
          </div>
          <SeverityBadge severity={r.severity} />
        </div>
      ))}
    </div>
  );
}

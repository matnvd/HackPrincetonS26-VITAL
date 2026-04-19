"use client";

import { useEffect, useRef, useState } from "react";
import { SEVERITY_COLOR, type AnalysisEvent } from "@/app/lib/types";
import SeverityBadge from "./SeverityBadge";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function sentenceCase(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

interface Props {
  events: AnalysisEvent[];
  activeEventId: string | null;
  onSelect?: (event: AnalysisEvent) => void;
}

export default function EventLogs({ events, activeEventId, onSelect }: Props) {
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevActiveRef = useRef<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (activeEventId && activeEventId !== prevActiveRef.current) {
      const el = itemRefs.current[activeEventId];
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    prevActiveRef.current = activeEventId;
  }, [activeEventId]);

  if (events.length === 0) {
    return (
      <div className="rounded-md border border-white/10 bg-[#0c0c12] px-3 py-6 text-center text-xs text-slate-500">
        No events yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {events.map((evt) => {
        const color = SEVERITY_COLOR[evt.severity];
        const active = evt.id === activeEventId;
        const isOpen = expanded[evt.id] ?? false;
        return (
          <div
            key={evt.id}
            ref={(el) => {
              itemRefs.current[evt.id] = el;
            }}
            onClick={() => onSelect?.(evt)}
            className={`group cursor-pointer rounded-r-lg bg-[#0c0c12] px-3.5 py-2.5 transition-colors hover:bg-white/5 ${
              active ? "ring-2 ring-white/30" : ""
            }`}
            style={{ borderLeft: `3px solid ${color}` }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="font-mono text-xs text-slate-500">
                  {formatTime(evt.startTs)}
                </span>
                <span className="truncate text-xs font-medium text-slate-200">
                  {evt.patientLabel}
                </span>
                <span className="truncate text-xs text-slate-400">
                  {sentenceCase(evt.eventType)}
                </span>
              </div>
              <SeverityBadge severity={evt.severity} />
            </div>
            <p className="mt-1.5 text-sm leading-snug text-slate-300">{evt.summary}</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((p) => ({ ...p, [evt.id]: !isOpen }));
              }}
              className="mt-1.5 text-[11px] text-slate-500 transition-colors hover:text-slate-300"
            >
              Symptoms {isOpen ? "▲" : "▼"}
            </button>
            {isOpen && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {evt.symptoms.length === 0 ? (
                  <span className="text-[11px] text-slate-600">No symptoms recorded.</span>
                ) : (
                  evt.symptoms.map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300"
                    >
                      {s}
                    </span>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

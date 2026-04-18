"use client";

import { useState } from "react";
import type { FrameResult } from "@/app/results/page";

type RiskLevel = "GREEN" | "YELLOW" | "RED";

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; border: string; dot: string; segment: string }> = {
  GREEN:  { label: "Normal",     color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/40",  dot: "bg-green-400",  segment: "bg-green-500"  },
  YELLOW: { label: "Concerning", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/40", dot: "bg-yellow-400", segment: "bg-yellow-500" },
  RED:    { label: "Urgent",     color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/40",    dot: "bg-red-400",    segment: "bg-red-500"    },
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

interface TimelineProps {
  results: FrameResult[];
  pendingCount?: number;
}

export default function Timeline({ results, pendingCount = 0 }: TimelineProps) {
  const [selected, setSelected] = useState<number | null>(null);

  const active = selected !== null ? results[selected] : null;
  const cfg = active ? RISK_CONFIG[active.risk] : null;

  const handleClick = (i: number) => {
    setSelected((prev) => (prev === i ? null : i));
  };

  return (
    <div>
      {/* Segment bar */}
      <div className="flex gap-1 h-10 rounded-xl overflow-hidden">
        {results.map((r, i) => (
          <button
            key={i}
            onClick={() => handleClick(i)}
            title={`${formatTime(r.timestampSec)} — ${RISK_CONFIG[r.risk].label}`}
            className={`
              flex-1 relative transition-all duration-150 cursor-pointer
              ${RISK_CONFIG[r.risk].segment}
              ${selected === i ? "ring-2 ring-white ring-inset brightness-110" : "hover:brightness-125"}
            `}
          >
            {/* Tick mark at bottom of selected segment */}
            {selected === i && (
              <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0
                border-l-4 border-r-4 border-t-4
                border-l-transparent border-r-transparent border-t-white" />
            )}
          </button>
        ))}

        {/* Pending placeholders */}
        {Array.from({ length: pendingCount }).map((_, i) => (
          <div key={`p-${i}`} className="flex-1 bg-gray-800 animate-pulse rounded-sm" />
        ))}
      </div>

      {/* Timestamp labels */}
      <div className="flex mt-1">
        {results.map((r, i) => (
          <div key={i} className="flex-1 text-center">
            {(i === 0 || i === results.length - 1 || i === Math.floor(results.length / 2)) && (
              <span className="text-gray-600 text-xs font-mono">{formatTime(r.timestampSec)}</span>
            )}
          </div>
        ))}
      </div>

      {/* Detail panel */}
      <div className={`
        mt-4 rounded-xl border p-4 transition-all duration-200
        ${active ? `${cfg!.bg} ${cfg!.border}` : "bg-gray-900 border-gray-800"}
      `}>
        {active ? (
          <div className="flex gap-3">
            <span className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${cfg!.dot}`} />
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-xs font-semibold ${cfg!.color}`}>{cfg!.label}</span>
                <span className="text-gray-600 text-xs font-mono">{formatTime(active.timestampSec)}</span>
              </div>
              <p className="text-gray-200 text-sm">{active.description}</p>
              <p className="text-gray-500 text-xs mt-1">{active.explanation}</p>
            </div>
          </div>
        ) : (
          <p className="text-gray-600 text-sm text-center">Click a segment to see details</p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisEvent } from "@/app/lib/types";
import SharedEventCard from "@/app/components/SharedEventCard";

interface Props {
  events: AnalysisEvent[];
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

const STICK_THRESHOLD_PX = 50;

export default function LiveLogs({ events }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [autoStick, setAutoStick] = useState(true);
  const autoStickRef = useRef(autoStick);

  useEffect(() => {
    autoStickRef.current = autoStick;
  }, [autoStick]);

  useEffect(() => {
    if (!autoStickRef.current) return;
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [events.length]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const stick = distanceFromBottom < STICK_THRESHOLD_PX;
    if (stick !== autoStickRef.current) setAutoStick(stick);
  };

  if (events.length === 0) {
    return (
      <div className="rounded-md border border-white/10 bg-[#0c0c12] px-3 py-6 text-center text-xs text-slate-500">
        Waiting for events…
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="-mr-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-2"
      >
        {events.map((evt) => (
          <SharedEventCard
            key={evt.id}
            event={evt}
            timeLabel={formatClock(evt.createdAt)}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      {!autoStick && (
        <button
          type="button"
          onClick={() => {
            setAutoStick(true);
            bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
          }}
          className="absolute bottom-2 right-2 rounded-full border border-white/20 bg-black/70 px-3 py-1 text-[11px] text-slate-200 shadow-lg backdrop-blur hover:bg-black/90"
        >
          ↓ Newest
        </button>
      )}
    </div>
  );
}

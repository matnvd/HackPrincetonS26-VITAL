"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AnalysisEvent,
  EventType,
  Severity,
} from "@/app/lib/types";
import { fetchWithToast } from "@/app/lib/fetchWithToast";
import LiveFeed from "./LiveFeed";
import LiveLogs from "./LiveLogs";
import KeyEventsSummary from "./KeyEventsSummary";

interface SessionInfo {
  id: string;
  startedAt: number;
}

const STUB_LIVE = process.env.NEXT_PUBLIC_STUB_LIVE === "true";

function clientUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const STUB_EVENT_POOL: Array<{
  patientLabel: string;
  eventType: EventType;
  severity: Severity;
  summary: string;
  symptoms: string[];
}> = [
  {
    patientLabel: "elderly man blue cap",
    eventType: "respiratory",
    severity: "urgent",
    summary: "Rapid shallow breathing with hand on chest.",
    symptoms: ["tachypnea", "hand on chest"],
  },
  {
    patientLabel: "young woman red coat",
    eventType: "fall",
    severity: "critical",
    summary: "Slumped to the floor, not moving.",
    symptoms: ["unresponsive", "ground level"],
  },
  {
    patientLabel: "middle-aged man grey hoodie",
    eventType: "agitation",
    severity: "moderate",
    summary: "Pacing and muttering, increasingly restless.",
    symptoms: ["pacing", "muttering"],
  },
  {
    patientLabel: "child green shirt",
    eventType: "other",
    severity: "low",
    summary: "Quiet, sitting still next to caregiver.",
    symptoms: ["calm"],
  },
  {
    patientLabel: "older woman beige scarf",
    eventType: "cardiac",
    severity: "critical",
    summary: "Clutching chest, pale, sweating.",
    symptoms: ["chest pain", "diaphoresis", "pallor"],
  },
];

export default function LiveMonitor() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [active, setActive] = useState(false);
  const [events, setEvents] = useState<AnalysisEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const stubIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const closeStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (stubIntervalRef.current) {
      clearInterval(stubIntervalRef.current);
      stubIntervalRef.current = null;
    }
  }, []);

  useEffect(() => closeStream, [closeStream]);

  const startStubLoop = useCallback((sessionId: string) => {
    if (stubIntervalRef.current) return;
    stubIntervalRef.current = setInterval(() => {
      const spec = STUB_EVENT_POOL[Math.floor(Math.random() * STUB_EVENT_POOL.length)];
      const now = new Date().toISOString();
      const event: AnalysisEvent = {
        id: clientUuid(),
        sessionId,
        startTs: 0,
        endTs: 1,
        eventType: spec.eventType,
        severity: spec.severity,
        patientLabel: spec.patientLabel,
        summary: spec.summary,
        symptoms: spec.symptoms,
        confidence: 0.7 + Math.random() * 0.25,
        source: "live",
        createdAt: now,
      };
      setEvents((prev) => [...prev, event]);
    }, 4000);
  }, []);

  const handleStart = useCallback(async () => {
    if (busy || active) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithToast(
        "/api/tab3/sessions",
        { method: "POST" },
        { errorMessage: "Could not start live session" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Failed to start (${res.status})`);
      const id: string = body.sessionId;
      const startedAt = Date.now();
      setSession({ id, startedAt });
      setEvents([]);
      setActive(true);

      try {
        const detailRes = await fetch(`/api/tab3/sessions/${id}`, { cache: "no-store" });
        if (detailRes.ok) {
          const detail = await detailRes.json();
          if (Array.isArray(detail.events) && detail.events.length > 0) {
            setEvents(detail.events as AnalysisEvent[]);
          }
        }
      } catch {
        /* hydration is best-effort */
      }

      if (STUB_LIVE) {
        startStubLoop(id);
      } else {
        const es = new EventSource(`/api/tab3/sessions/${id}/stream`);
        eventSourceRef.current = es;
        es.onmessage = (msg) => {
          try {
            const parsed = JSON.parse(msg.data) as { type: string; data?: unknown };
            if (parsed.type === "event" && parsed.data) {
              setEvents((prev) => {
                const evt = parsed.data as AnalysisEvent;
                if (prev.some((e) => e.id === evt.id)) return prev;
                return [...prev, evt];
              });
            } else if (parsed.type === "play_alert") {
              const data = parsed.data as { audioPath?: string } | undefined;
              if (data?.audioPath) {
                const audio = new Audio(`/api/tab3/alerts/${data.audioPath}`);
                audio.play().catch((err) =>
                  console.error("[LiveMonitor] audio playback failed:", err),
                );
              }
            } else if (parsed.type === "session_ended") {
              closeStream();
              setActive(false);
            }
          } catch (err) {
            console.warn("[LiveMonitor] bad SSE payload:", err);
          }
        };
        es.onerror = () => {
          /* browser auto-reconnects unless we close */
        };
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setActive(false);
      setSession(null);
    } finally {
      setBusy(false);
    }
  }, [busy, active, closeStream, startStubLoop]);

  const handleStop = useCallback(async () => {
    if (busy || !session) return;
    setBusy(true);
    try {
      closeStream();
      setActive(false);
      try {
        await fetchWithToast(
          `/api/tab3/sessions/${session.id}/end`,
          { method: "POST" },
          { errorMessage: "Could not end session cleanly" },
        );
      } catch (err) {
        console.warn("[LiveMonitor] stop request failed:", err);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, session, closeStream]);

  const handleFrame = useCallback(
    (base64: string, timestamp: number) => {
      if (!session) return;
      if (STUB_LIVE) return;
      fetch("/api/tab3/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, timestamp, imageBase64: base64 }),
      }).catch((err) => console.error("[LiveMonitor] analyze failed:", err));
    },
    [session],
  );

  const sortedEvents = events;
  const sessionStart = session?.startedAt ?? Date.now();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#09090f] text-slate-200 lg:flex-row">
      <section className="flex w-full min-w-0 flex-col gap-4 border-b border-white/10 p-6 lg:basis-[55%] lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-white">Live Monitor</h1>
            <p className="mt-1 text-xs text-slate-400">
              {STUB_LIVE
                ? "Stub mode: random events fabricated client-side every 4s. No webcam frames sent."
                : "Webcam frames captured every 2.5s and sent to the model. Events stream over SSE."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {active ? (
              <button
                type="button"
                onClick={handleStop}
                disabled={busy}
                className="rounded-md border border-red-500/40 bg-red-500/15 px-4 py-1.5 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/25 disabled:opacity-50"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStart}
                disabled={busy}
                className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-4 py-1.5 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
              >
                Start
              </button>
            )}
          </div>
        </div>

        <LiveFeed
          sessionId={session?.id ?? null}
          active={active}
          sessionStart={sessionStart}
          onFrame={handleFrame}
        />

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {session && (
          <div className="flex items-center justify-between rounded-md border border-white/10 bg-[#0c0c12] px-3 py-2 text-[11px] text-slate-500">
            <span>
              Session <span className="font-mono text-slate-400">{session.id.slice(0, 8)}</span>
            </span>
            <span>
              {events.length} event{events.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
            Key events
          </div>
          <KeyEventsSummary events={sortedEvents} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
            Live log
          </div>
          <LiveLogs events={sortedEvents} />
        </div>
      </section>
    </div>
  );
}

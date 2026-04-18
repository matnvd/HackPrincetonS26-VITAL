"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { VideoFrame } from "@/lib/extractFrames";
import Timeline from "@/components/Timeline";

type RiskLevel = "GREEN" | "YELLOW" | "RED";
type Severity  = "LOW" | "MEDIUM" | "HIGH";

export interface FrameResult {
  timestampSec: number;
  index: number;
  risk: RiskLevel;
  description: string;
  explanation: string;
}

interface Summary {
  overview: string;
  criticalMoment: string | null;
  action: string;
  severity: Severity;
}

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; dot: string }> = {
  GREEN:  { label: "Normal",     color: "text-green-400",  bg: "bg-green-500/10 border-green-500/30",  dot: "bg-green-400"  },
  YELLOW: { label: "Concerning", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", dot: "bg-yellow-400" },
  RED:    { label: "Urgent",     color: "text-red-400",    bg: "bg-red-500/10 border-red-500/30",      dot: "bg-red-400"    },
};

const SEVERITY_CONFIG: Record<Severity, { color: string; bg: string; border: string }> = {
  LOW:    { color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30"  },
  MEDIUM: { color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
  HIGH:   { color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30"    },
};

async function classifyFrame(base64: string): Promise<{ risk: RiskLevel; description: string; explanation: string }> {
  const res = await fetch("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64 }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function fetchSummary(results: FrameResult[]): Promise<Summary> {
  const res = await fetch("/api/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ results }),
  });
  if (!res.ok) throw new Error(`Summary API error ${res.status}`);
  return res.json();
}

function ResultsContent() {
  const params = useSearchParams();
  const router = useRouter();
  const filename = params.get("name") ?? "video";

  const [results, setResults]         = useState<FrameResult[]>([]);
  const [status, setStatus]           = useState<"idle" | "analyzing" | "summarizing" | "done" | "error">("idle");
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames]   = useState(0);
  const [summary, setSummary]           = useState<Summary | null>(null);
  const [error, setError]               = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("wait_frames");
    if (!raw) {
      setError("No frames found. Go back and upload a video.");
      setStatus("error");
      return;
    }

    const frames: VideoFrame[] = JSON.parse(raw);
    setTotalFrames(frames.length);
    setStatus("analyzing");

    (async () => {
      const collected: FrameResult[] = [];

      for (let i = 0; i < frames.length; i++) {
        setCurrentFrame(i + 1);
        try {
          const classification = await classifyFrame(frames[i].base64);
          collected.push({ index: i, timestampSec: frames[i].timestampSec, ...classification });
          setResults([...collected]);
        } catch (err) {
          console.error(`Frame ${i + 1} failed:`, err);
          collected.push({
            index: i,
            timestampSec: frames[i].timestampSec,
            risk: "GREEN",
            description: "Could not classify this frame.",
            explanation: "API error — treated as normal.",
          });
          setResults([...collected]);
        }

        if (i < frames.length - 1) await new Promise((r) => setTimeout(r, 600));
      }

      // Generate summary from all frame results
      setStatus("summarizing");
      try {
        const s = await fetchSummary(collected);
        setSummary(s);
      } catch (err) {
        console.error("Summary failed:", err);
      }

      setStatus("done");
    })();
  }, []);

  const highestRisk: RiskLevel = results.some((r) => r.risk === "RED")
    ? "RED"
    : results.some((r) => r.risk === "YELLOW")
    ? "YELLOW"
    : "GREEN";

  const riskCounts = { GREEN: 0, YELLOW: 0, RED: 0 };
  results.forEach((r) => riskCounts[r.risk]++);

  const isAnalyzing   = status === "analyzing";
  const isSummarizing = status === "summarizing";
  const isDone        = status === "done";

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      {/* Back */}
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm mb-8 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        New video
      </button>

      {/* Title row */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Analysis Results</h1>
          <p className="text-gray-500 text-sm mt-1 truncate max-w-xs">{filename}</p>
        </div>

        {isAnalyzing ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-700 bg-gray-800 text-gray-400 text-sm">
            <span className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
            Analyzing {currentFrame}/{totalFrames}
          </div>
        ) : isSummarizing ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-700 bg-gray-800 text-gray-400 text-sm">
            <span className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
            Summarizing…
          </div>
        ) : isDone ? (
          <div className={`px-3 py-1.5 rounded-full border text-sm font-semibold ${RISK_CONFIG[highestRisk].bg} ${RISK_CONFIG[highestRisk].color}`}>
            {RISK_CONFIG[highestRisk].label}
          </div>
        ) : null}
      </div>

      {/* Error state */}
      {status === "error" && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-8">
          {error}
        </div>
      )}

      {/* Progress bar */}
      {isAnalyzing && (
        <div className="mb-8">
          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-red-500 transition-all duration-500"
              style={{ width: `${(currentFrame / totalFrames) * 100}%` }}
            />
          </div>
          <p className="text-gray-600 text-xs mt-2">
            Analyzing frame {currentFrame} of {totalFrames}…
          </p>
        </div>
      )}

      {/* Risk summary chips */}
      {results.length > 0 && isDone && (
        <div className="flex gap-3 mb-8">
          {(["RED", "YELLOW", "GREEN"] as RiskLevel[]).map((level) => (
            <div key={level} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${RISK_CONFIG[level].bg} ${RISK_CONFIG[level].color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${RISK_CONFIG[level].dot}`} />
              {riskCounts[level]} {RISK_CONFIG[level].label}
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      {(results.length > 0 || isAnalyzing) && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Timeline</h2>
          <Timeline results={results} pendingCount={totalFrames - results.length} />
        </section>
      )}

      {/* Triage Report */}
      {(isSummarizing || summary) && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Triage Report</h2>

          {isSummarizing && !summary ? (
            /* Skeleton while waiting */
            <div className="p-5 rounded-xl bg-gray-900 border border-gray-800 space-y-3 animate-pulse">
              <div className="h-3 bg-gray-700 rounded w-full" />
              <div className="h-3 bg-gray-700 rounded w-5/6" />
              <div className="h-3 bg-gray-700 rounded w-2/3" />
              <div className="mt-4 h-3 bg-gray-700 rounded w-1/2" />
              <div className="h-3 bg-gray-700 rounded w-1/3" />
            </div>
          ) : summary ? (
            <div className="rounded-xl border border-gray-800 overflow-hidden">
              {/* Overview */}
              <div className="p-5 bg-gray-900">
                <p className="text-gray-300 text-sm leading-relaxed">{summary.overview}</p>
              </div>

              <div className="border-t border-gray-800 divide-y divide-gray-800">
                {/* Critical moment */}
                {summary.criticalMoment && (
                  <div className="flex gap-3 px-5 py-4 bg-gray-900/50">
                    <svg className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <div>
                      <p className="text-xs font-semibold text-yellow-400 mb-1">Critical Moment</p>
                      <p className="text-gray-400 text-sm">{summary.criticalMoment}</p>
                    </div>
                  </div>
                )}

                {/* Recommended action */}
                <div className="flex gap-3 px-5 py-4 bg-gray-900/50">
                  <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <div>
                    <p className="text-xs font-semibold text-blue-400 mb-1">Recommended Action</p>
                    <p className="text-gray-400 text-sm">{summary.action}</p>
                  </div>
                </div>

                {/* Severity */}
                <div className="flex items-center justify-between px-5 py-4 bg-gray-900/50">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Overall Severity</p>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${SEVERITY_CONFIG[summary.severity].color} ${SEVERITY_CONFIG[summary.severity].bg} ${SEVERITY_CONFIG[summary.severity].border}`}>
                    {summary.severity}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}

export default function ResultsPage() {
  return (
    <Suspense>
      <ResultsContent />
    </Suspense>
  );
}

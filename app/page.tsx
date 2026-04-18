"use client";

import { useState } from "react";
import Dashboard from "@/components/Dashboard";
import VideoTab from "@/components/VideoTab";
import ApiKeySettings from "@/components/ApiKeySettings";
import { mergePatients } from "@/lib/patientStore";
import type { Patient, DetectedPerson } from "@/lib/patientStore";

type Tab = "dashboard" | "video";
type DataMode = "demo" | "real";

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dataMode, setDataMode] = useState<DataMode>("demo");
  const [patients, setPatients] = useState<Patient[]>([]);

  const handleFrameAnalyzed = (people: DetectedPerson[], frameBase64: string) => {
    if (people.length === 0) return;
    setPatients((prev) => mergePatients(prev, people, frameBase64));
  };

  const handleAnalysisStart = () => setTab("dashboard");

  const handleConfirm = (key: string) => {
    setPatients((prev) =>
      prev.map((p) => (p.key === key ? { ...p, confirmed: !p.confirmed } : p))
    );
  };

  const activeCount = patients.filter((p) => !p.confirmed).length;
  const urgentCount = patients.filter((p) => !p.confirmed && p.risk === "RED").length;
  const watchCount = patients.filter((p) => !p.confirmed && p.risk === "YELLOW").length;
  const treatedCount = patients.filter((p) => p.confirmed).length;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(239,68,68,0.14),_transparent_30%),linear-gradient(180deg,_#09111d_0%,_#050913_100%)] text-white">
      <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-300/80">
              Watchful AI Incident Triage
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              W<span className="text-red-400">.</span>A<span className="text-red-400">.</span>I<span className="text-red-400">.</span>T<span className="text-red-400">.</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-5 text-slate-300">
              Turn video into per-person triage insights that highlight who needs attention first, what is happening,
              and why the operator should respond.
            </p>
          </div>

          <div className="flex flex-col gap-3 xl:items-end">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-red-200/75">Urgent</p>
                <p className="mt-1 text-lg font-semibold text-red-300">{urgentCount}</p>
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-amber-100/75">Watch</p>
                <p className="mt-1 text-lg font-semibold text-amber-200">{watchCount}</p>
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-100/75">Active</p>
                <p className="mt-1 text-lg font-semibold text-emerald-200">{activeCount}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
                {([
                  { key: "demo", label: "Preview / Demo" },
                  { key: "real", label: "Real Mode" },
                ] as { key: DataMode; label: string }[]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setDataMode(key)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                      dataMode === key
                        ? "bg-red-500/20 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {patients.length > 0 && (
                <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
                  {treatedCount} treated
                </div>
              )}
              <ApiKeySettings />
            </div>
          </div>
          </div>
        </div>
      </header>

      <nav className="mx-auto flex w-full max-w-7xl flex-wrap gap-2 px-6 pt-4">
        {([
          { key: "dashboard", label: "Dashboard", detail: "Urgency-ranked patient cards", badge: activeCount > 0 ? activeCount : null },
          { key: "video", label: "Sources", detail: "Live feed and uploaded footage", badge: null },
        ] as { key: Tab; label: string; detail: string; badge: number | null }[]).map(({ key, label, detail, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer ${
              tab === key
                ? "border-red-400/40 bg-red-500/10 shadow-[0_0_0_1px_rgba(248,113,113,0.15)]"
                : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]"
            }`}
          >
            <div>
              <p className={`text-xs font-semibold ${tab === key ? "text-white" : "text-slate-200"}`}>{label}</p>
              <p className="text-[10px] text-slate-400">{detail}</p>
            </div>
            {badge !== null && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main className="mx-auto flex w-full max-w-7xl flex-1 px-6 py-6">
        <div className={`w-full ${tab !== "dashboard" ? "hidden" : ""}`}>
          <Dashboard patients={patients} onConfirm={handleConfirm} mode={dataMode} />
        </div>

        <div className={`w-full ${tab !== "video" ? "hidden" : ""}`}>
          <VideoTab
            onFrameAnalyzed={handleFrameAnalyzed}
            onAnalysisStart={handleAnalysisStart}
          />
        </div>
      </main>
    </div>
  );
}

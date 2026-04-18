"use client";

import { useState } from "react";
import Dashboard from "@/components/Dashboard";
import VideoTab from "@/components/VideoTab";
import ApiKeySettings from "@/components/ApiKeySettings";
import { mergePatients } from "@/lib/patientStore";
import type { Patient, DetectedPerson } from "@/lib/patientStore";

type Tab = "dashboard" | "video";

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
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
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.32em] text-amber-300/80">
              Watchful AI Incident Triage
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              W<span className="text-red-400">.</span>A<span className="text-red-400">.</span>I<span className="text-red-400">.</span>T<span className="text-red-400">.</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
              Turn video into per-person triage insights that highlight who needs attention first, what is happening,
              and why the operator should respond.
            </p>
          </div>

          <div className="flex flex-col items-start gap-4 lg:items-end">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-red-200/75">Urgent</p>
                <p className="mt-2 text-2xl font-semibold text-red-300">{urgentCount}</p>
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-100/75">Watch</p>
                <p className="mt-2 text-2xl font-semibold text-amber-200">{watchCount}</p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-100/75">Active</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-200">{activeCount}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {patients.length > 0 && (
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
                  {treatedCount} treated
                </div>
              )}
              <ApiKeySettings />
            </div>
          </div>
        </div>
      </header>

      <nav className="mx-auto flex w-full max-w-7xl gap-3 px-6 pt-6">
        {([
          { key: "dashboard", label: "Dashboard", detail: "Urgency-ranked patient cards", badge: activeCount > 0 ? activeCount : null },
          { key: "video", label: "Sources", detail: "Live feed and uploaded footage", badge: null },
        ] as { key: Tab; label: string; detail: string; badge: number | null }[]).map(({ key, label, detail, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-all cursor-pointer ${
              tab === key
                ? "border-red-400/40 bg-red-500/10 shadow-[0_0_0_1px_rgba(248,113,113,0.15)]"
                : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]"
            }`}
          >
            <div>
              <p className={`text-sm font-semibold ${tab === key ? "text-white" : "text-slate-200"}`}>{label}</p>
              <p className="text-xs text-slate-400">{detail}</p>
            </div>
            {badge !== null && (
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-bold text-white">
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main className="mx-auto flex w-full max-w-7xl flex-1 px-6 py-6">
        <div className={`w-full ${tab !== "dashboard" ? "hidden" : ""}`}>
          <Dashboard patients={patients} onConfirm={handleConfirm} />
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

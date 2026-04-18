"use client";

import { useState } from "react";
import Dashboard from "@/components/Dashboard";
import VideoTab from "@/components/VideoTab";
import { mergePatients } from "@/lib/patientStore";
import type { Patient, DetectedPerson } from "@/lib/patientStore";

type Tab = "dashboard" | "video";

export default function App() {
  const [tab, setTab]           = useState<Tab>("video");
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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white">
            W<span className="text-red-500">.</span>A<span className="text-red-500">.</span>I<span className="text-red-500">.</span>T<span className="text-red-500">.</span>
          </h1>
          <p className="text-gray-600 text-xs">Watchful AI Incident Triage</p>
        </div>

        {/* Live stats */}
        {patients.length > 0 && (
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {activeCount > 0 && (
              <span className="flex items-center gap-1.5 text-red-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                {activeCount} awaiting care
              </span>
            )}
            <span>{patients.filter((p) => p.confirmed).length} treated</span>
          </div>
        )}
      </header>

      {/* Tab bar */}
      <nav className="flex border-b border-gray-800 px-6">
        {([
          { key: "dashboard", label: "Dashboard", badge: activeCount > 0 ? activeCount : null },
          { key: "video",     label: "Video Input", badge: null },
        ] as { key: Tab; label: string; badge: number | null }[]).map(({ key, label, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative flex items-center gap-2 px-1 py-3 mr-6 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
              tab === key
                ? "border-red-500 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {label}
            {badge !== null && (
              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-xs font-bold">
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Tab content — both stay mounted so the live camera interval survives tab switches */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8">
        <div className={tab !== "dashboard" ? "hidden" : ""}>
          <Dashboard patients={patients} onConfirm={handleConfirm} />
        </div>
        <div className={tab !== "video" ? "hidden" : ""}>
          <VideoTab
            onFrameAnalyzed={handleFrameAnalyzed}
            onAnalysisStart={handleAnalysisStart}
          />
        </div>
      </main>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { Patient, RiskLevel } from "@/lib/patientStore";
import { sortByRisk, featureSeverity } from "@/lib/patientStore";

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; border: string; dot: string; pill: string }> = {
  RED:    { label: "Urgent",      color: "text-red-400",    bg: "bg-red-500/20",    border: "border-red-500/40",    dot: "bg-red-400",    pill: "bg-red-500/20 text-red-300 border-red-500/30"    },
  YELLOW: { label: "Concerning",  color: "text-yellow-400", bg: "bg-yellow-500/20", border: "border-yellow-500/40", dot: "bg-yellow-400", pill: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  GREEN:  { label: "Stable",      color: "text-green-400",  bg: "bg-green-500/20",  border: "border-green-500/40",  dot: "bg-green-400",  pill: "bg-green-500/20 text-green-300 border-green-500/30"  },
};

// Person index → color used in the live overlay
const PERSON_COLORS: Record<string, string> = {
  person_1: "#00ff88",
  person_2: "#38bdf8",
  person_3: "#fb923c",
  person_4: "#a78bfa",
};

function formatElapsed(since: number): string {
  const secs = Math.floor((Date.now() - since) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function ElapsedTimer({ since }: { since: number }) {
  const [elapsed, setElapsed] = useState(formatElapsed(since));
  useEffect(() => {
    const id = setInterval(() => setElapsed(formatElapsed(since)), 1000);
    return () => clearInterval(id);
  }, [since]);
  return <span>{elapsed}</span>;
}

function PatientCard({ patient, onConfirm }: { patient: Patient; onConfirm: (key: string) => void }) {
  const cfg        = RISK_CONFIG[patient.risk];
  const accentColor = PERSON_COLORS[patient.id] ?? "#ffffff";
  const personNum   = patient.id.replace("person_", "");

  return (
    <div
      className={`rounded-xl border overflow-hidden flex flex-col transition-opacity ${
        patient.confirmed ? "opacity-40" : ""
      } ${cfg.border} bg-gray-900`}
    >
      {/* Thumbnail */}
      <div className="relative bg-gray-800 aspect-video shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={patient.thumbnail} alt="" className="w-full h-full object-cover" />

        {/* Person badge — top left, colored per person */}
        <div
          className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold border backdrop-blur-sm"
          style={{ color: accentColor, borderColor: accentColor + "60", backgroundColor: accentColor + "20" }}
        >
          PERSON {personNum}
        </div>

        {/* Risk badge — top right */}
        <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border backdrop-blur-sm ${cfg.bg} ${cfg.border} ${cfg.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </div>

        {/* Elapsed timer */}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-gray-300 text-xs font-mono">
          <ElapsedTimer since={patient.firstSeen} />
        </div>

        {patient.confirmed && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-green-400 text-xs font-bold uppercase tracking-widest">Receiving Treatment</span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-2.5 flex flex-col gap-2 flex-1">
        {/* Description */}
        <p className="text-gray-300 text-xs leading-snug line-clamp-2">
          {patient.description}
        </p>

        {/* Reason / justification */}
        <p className="text-gray-600 text-xs leading-snug line-clamp-2 italic">
          {patient.reason}
        </p>

        {/* Feature tags */}
        <div className="flex flex-col gap-1">
          {patient.features.slice(0, 4).map((f, i) => {
            const isCritical = i === 0 && featureSeverity(f) >= 3;
            return (
              <span
                key={f}
                className={`px-1.5 py-0.5 rounded text-xs border leading-snug ${
                  isCritical
                    ? "bg-red-500/30 text-red-200 border-red-500/50 font-semibold"
                    : cfg.pill
                }`}
              >
                {isCritical && "⚠ "}{f}
              </span>
            );
          })}
          {patient.features.length > 4 && (
            <span className="px-1.5 py-0.5 text-xs text-gray-600 leading-none">
              +{patient.features.length - 4} more
            </span>
          )}
        </div>

        <button
          onClick={() => onConfirm(patient.key)}
          className={`mt-auto w-full text-xs py-1.5 rounded-lg border font-medium transition-all cursor-pointer ${
            patient.confirmed
              ? "border-green-500/40 bg-green-500/10 text-green-400"
              : "border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300"
          }`}
        >
          {patient.confirmed ? "✓ Treated" : "Mark as Treated"}
        </button>
      </div>
    </div>
  );
}

interface Props {
  patients: Patient[];
  onConfirm: (key: string) => void;
}

export default function Dashboard({ patients, onConfirm }: Props) {
  const active         = sortByRisk(patients.filter((p) => !p.confirmed));
  const confirmed      = patients.filter((p) => p.confirmed);
  const criticalCount  = active.filter((p) => p.risk === "RED").length;

  if (patients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.67v6.66a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        </div>
        <p className="text-gray-400 font-medium">No patients detected yet</p>
        <p className="text-gray-600 text-sm mt-1">Go to the Video tab to upload footage or start a live feed</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {criticalCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500/50 bg-red-500/10 animate-pulse mb-4">
          <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-red-400 font-bold text-sm">
            IMMEDIATE ATTENTION REQUIRED — {criticalCount} patient{criticalCount > 1 ? "s" : ""} in critical condition
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {active.map((p) => (
          <PatientCard key={p.key} patient={p} onConfirm={onConfirm} />
        ))}
      </div>

      {confirmed.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
            Receiving Treatment ({confirmed.length})
          </p>
          <div className="grid grid-cols-3 gap-3">
            {confirmed.map((p) => (
              <PatientCard key={p.key} patient={p} onConfirm={onConfirm} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

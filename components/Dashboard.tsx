"use client";

import { useState } from "react";
import type { Patient, RiskLevel } from "@/lib/patientStore";
import { sortByRisk } from "@/lib/patientStore";

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; border: string; dot: string; pill: string }> = {
  RED:    { label: "Urgent",     color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30",    dot: "bg-red-400",    pill: "bg-red-500/20 text-red-300 border-red-500/30"    },
  YELLOW: { label: "Concerning", color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", dot: "bg-yellow-400", pill: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  GREEN:  { label: "Stable",     color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30",  dot: "bg-green-400",  pill: "bg-green-500/20 text-green-300 border-green-500/30"  },
};

interface Props {
  patients: Patient[];
  onConfirm: (key: string) => void;
}

function PatientCard({ patient, onConfirm }: { patient: Patient; onConfirm: (key: string) => void }) {
  const [showObs, setShowObs] = useState(false);
  const cfg       = RISK_CONFIG[patient.risk];
  const confirmed = patient.confirmed;

  return (
    <div className={`rounded-xl border transition-opacity ${confirmed ? "opacity-40" : ""} ${cfg.bg} ${cfg.border}`}>
      <div className="p-4">
        <div className="flex gap-4">
          {/* Thumbnail */}
          <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-800 border border-gray-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={patient.thumbnail} alt="" className="w-full h-full object-cover" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-gray-200 text-sm font-medium capitalize leading-snug">{patient.id}</p>
              <span className={`shrink-0 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
            </div>

            <p className="text-gray-400 text-xs mb-2 leading-relaxed">{patient.condition}</p>

            {/* Symptom pills */}
            <div className="flex flex-wrap gap-1.5">
              {patient.symptoms.map((s) => (
                <span key={s} className={`px-2 py-0.5 rounded-full text-xs border ${cfg.pill}`}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Reason */}
        <p className="text-gray-500 text-xs italic mt-3 leading-relaxed">{patient.reason}</p>
      </div>

      {/* Clinical observations (collapsible) */}
      {patient.observation && (
        <div className="border-t border-white/5">
          <button
            onClick={() => setShowObs((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-gray-600 hover:text-gray-400 transition-colors cursor-pointer"
          >
            <span className="font-semibold uppercase tracking-wider">Clinical Observations</span>
            <svg className={`w-3.5 h-3.5 transition-transform ${showObs ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showObs && (
            <p className="px-4 pb-3 text-gray-500 text-xs leading-relaxed font-mono">
              {patient.observation}
            </p>
          )}
        </div>
      )}

      {/* Confirm row */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
        <span className="text-gray-700 text-xs">
          Seen {patient.seenCount}× · last updated {new Date(patient.lastSeen).toLocaleTimeString()}
        </span>
        <button
          onClick={() => onConfirm(patient.key)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
            confirmed
              ? "border-green-500/40 bg-green-500/10 text-green-400"
              : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500 hover:text-gray-200"
          }`}
        >
          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${confirmed ? "bg-green-500 border-green-500" : "border-gray-600"}`}>
            {confirmed && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </span>
          {confirmed ? "Receiving Treatment" : "Mark as Treated"}
        </button>
      </div>
    </div>
  );
}

export default function Dashboard({ patients, onConfirm }: Props) {
  const active    = sortByRisk(patients.filter((p) => !p.confirmed));
  const confirmed = patients.filter((p) => p.confirmed);

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
    <div className="space-y-3">
      {/* Active patients */}
      {active.map((p) => (
        <PatientCard key={p.key} patient={p} onConfirm={onConfirm} />
      ))}

      {/* Confirmed patients */}
      {confirmed.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
            Receiving Treatment ({confirmed.length})
          </p>
          <div className="space-y-3">
            {confirmed.map((p) => (
              <PatientCard key={p.key} patient={p} onConfirm={onConfirm} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { Patient, RiskLevel } from "@/lib/patientStore";
import { sortByRisk, featureSeverity } from "@/lib/patientStore";

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; border: string; dot: string; pill: string }> = {
  RED: { label: "Urgent", color: "text-red-200", bg: "bg-red-500/20", border: "border-red-500/40", dot: "bg-red-400", pill: "border-red-500/30 bg-red-500/10 text-red-100" },
  YELLOW: { label: "Concerning", color: "text-amber-100", bg: "bg-amber-400/20", border: "border-amber-400/35", dot: "bg-amber-300", pill: "border-amber-400/25 bg-amber-400/10 text-amber-50" },
  GREEN: { label: "Stable", color: "text-emerald-100", bg: "bg-emerald-500/20", border: "border-emerald-500/35", dot: "bg-emerald-400", pill: "border-emerald-500/25 bg-emerald-500/10 text-emerald-50" },
};

const PERSON_COLORS: Record<string, string> = {
  person_1: "#00ff88",
  person_2: "#38bdf8",
  person_3: "#fb923c",
  person_4: "#a78bfa",
  person_5: "#f472b6",
  person_6: "#facc15",
};

function formatElapsed(since: number): string {
  const secs = Math.floor((Date.now() - since) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function ElapsedTimer({ since }: { since: number }) {
  const [elapsed, setElapsed] = useState(formatElapsed(since));

  useEffect(() => {
    const id = setInterval(() => setElapsed(formatElapsed(since)), 1000);
    return () => clearInterval(id);
  }, [since]);

  return <span>{elapsed}</span>;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
    </svg>
  );
}

function PatientCard({ patient, onConfirm }: { patient: Patient; onConfirm: (key: string) => void }) {
  const cfg = RISK_CONFIG[patient.risk];
  const accentColor = PERSON_COLORS[patient.id] ?? "#ffffff";
  const personNum = patient.id.replace("person_", "");
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`overflow-hidden rounded-2xl border transition-all ${patient.confirmed ? "opacity-50" : ""} ${cfg.border} bg-slate-950/80 shadow-[0_10px_24px_rgba(2,6,23,0.28)]`}
    >
      <div className="flex min-h-[142px] gap-3 p-3">
        <div className="relative w-26 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-900 sm:w-28">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={patient.thumbnail} alt="" className="h-full min-h-[126px] w-full object-cover" />
          <div
            className="absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] backdrop-blur-sm"
            style={{ color: accentColor, borderColor: `${accentColor}66`, backgroundColor: `${accentColor}22` }}
          >
            P{personNum}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-white">{patient.description}</p>
            </div>

            <button
              onClick={() => setExpanded((value) => !value)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10 cursor-pointer"
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse patient details" : "Expand patient details"}
            >
              Details
              <Chevron open={expanded} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {patient.features.slice(0, 4).map((feature, index) => {
              const isCritical = index === 0 && featureSeverity(feature) >= 3;
              return (
                <span
                  key={feature}
                  className={`rounded-full border px-2.5 py-1 text-[10px] leading-4 ${isCritical ? "border-red-500/40 bg-red-500/15 font-semibold text-red-100" : cfg.pill}`}
                >
                  {feature}
                </span>
              );
            })}
          </div>

          <div className="mt-auto flex items-end justify-between gap-2 pt-3">
            <button
              onClick={() => onConfirm(patient.key)}
              className={`rounded-xl border px-3 py-2 text-[11px] font-medium transition-all cursor-pointer ${patient.confirmed ? "border-green-500/40 bg-green-500/10 text-green-300" : "border-white/10 bg-white/5 text-slate-200 hover:border-white/20 hover:bg-white/10"}`}
            >
              {patient.confirmed ? "Receiving care" : "Mark as receiving care"}
            </button>

            <div className="text-right text-[10px] text-slate-400">
              <p className="uppercase tracking-[0.16em] text-slate-500">Waiting</p>
              <p className="mt-1 font-mono text-xs text-slate-200">
                <ElapsedTimer since={patient.firstSeen} />
              </p>
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/10 bg-white/[0.03] px-3 py-3">
          <div className="rounded-xl border border-white/8 bg-slate-950/55 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Why This Needs Attention</p>
            <p className="mt-1.5 text-xs leading-5 text-slate-300">{patient.reason}</p>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">All Symptoms</p>
            {patient.features.map((feature, index) => {
              const isCritical = index === 0 && featureSeverity(feature) >= 3;
              return (
                <span
                  key={feature}
                  className={`rounded-xl border px-3 py-1.5 text-xs leading-5 ${isCritical ? "border-red-500/40 bg-red-500/15 font-semibold text-red-100" : cfg.pill}`}
                >
                  {feature}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  patients: Patient[];
  onConfirm: (key: string) => void;
  mode: "demo" | "real";
}

export default function Dashboard({ patients, onConfirm, mode }: Props) {
  const active = sortByRisk(patients.filter((p) => !p.confirmed));
  const confirmed = patients.filter((p) => p.confirmed);
  const criticalCount = active.filter((p) => p.risk === "RED").length;

  if (mode === "real" && patients.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-6 py-14 text-center">
        <p className="text-lg font-semibold text-white">Waiting for real incident data</p>
        <p className="mt-2 text-sm text-slate-400">Run an uploaded clip or live feed to populate patient cards here.</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {criticalCount > 0 && (
        <div className="alert-flash mb-4 flex items-center gap-3 rounded-2xl border border-red-300/80 bg-red-500/25 px-4 py-3 shadow-[0_0_40px_rgba(248,113,113,0.35)]">
          <svg className="h-5 w-5 shrink-0 text-red-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-sm font-semibold text-red-50">
            Immediate attention recommended for {criticalCount} patient{criticalCount > 1 ? "s" : ""} based on the latest visible cues.
          </p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {active.map((patient) => (
          <PatientCard key={patient.key} patient={patient} onConfirm={onConfirm} />
        ))}
      </div>

      {confirmed.length > 0 && (
        <div className="mt-7">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Receiving Treatment ({confirmed.length})
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {confirmed.map((patient) => (
              <PatientCard key={patient.key} patient={patient} onConfirm={onConfirm} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

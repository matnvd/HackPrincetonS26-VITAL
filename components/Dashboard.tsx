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
};

const PREVIEW_TIME = 1_760_000_000_000;

const PREVIEW_PATIENTS: Patient[] = [
  {
    key: "preview_1",
    id: "person_1",
    bbox: { x: 0, y: 0, w: 0, h: 0 },
    features: ["labored breathing", "slumped posture", "hand on chest"],
    risk: "RED",
    description: "Adult seated forward with visible respiratory strain and limited responsiveness.",
    reason: "Posture and breathing pattern suggest acute distress and require immediate in-person assessment.",
    cropBase64: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='%230d1320'/><rect x='36' y='28' width='568' height='304' rx='24' fill='%23182133'/><circle cx='220' cy='130' r='54' fill='%23f2c9a5'/><rect x='168' y='192' width='108' height='102' rx='34' fill='%239b4b3e'/><rect x='286' y='124' width='164' height='142' rx='26' fill='%23b24545'/><rect x='312' y='92' width='88' height='22' rx='11' fill='%23ef4444' fill-opacity='0.65'/><rect x='298' y='286' width='196' height='18' rx='9' fill='%23f59e0b' fill-opacity='0.38'/></svg>",
    thumbnail: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='%230d1320'/><rect x='36' y='28' width='568' height='304' rx='24' fill='%23182133'/><circle cx='220' cy='130' r='54' fill='%23f2c9a5'/><rect x='168' y='192' width='108' height='102' rx='34' fill='%239b4b3e'/><rect x='286' y='124' width='164' height='142' rx='26' fill='%23b24545'/><rect x='312' y='92' width='88' height='22' rx='11' fill='%23ef4444' fill-opacity='0.65'/><rect x='298' y='286' width='196' height='18' rx='9' fill='%23f59e0b' fill-opacity='0.38'/></svg>",
    firstSeen: PREVIEW_TIME - 84000,
    lastSeen: PREVIEW_TIME,
    confirmed: false,
    seenCount: 2,
  },
  {
    key: "preview_2",
    id: "person_2",
    bbox: { x: 0, y: 0, w: 0, h: 0 },
    features: ["dizziness", "leaning on support", "reduced balance"],
    risk: "YELLOW",
    description: "Standing adult appears unsteady and intermittently braces against nearby furniture.",
    reason: "Balance changes and guarded stance may indicate worsening fatigue, pain, or near-syncope.",
    cropBase64: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='%230c1320'/><rect x='36' y='28' width='568' height='304' rx='24' fill='%2317222f'/><circle cx='250' cy='118' r='48' fill='%23edc19a'/><rect x='210' y='172' width='84' height='118' rx='28' fill='%232f6d8c'/><rect x='308' y='116' width='122' height='166' rx='24' fill='%233b82f6' fill-opacity='0.55'/><rect x='436' y='96' width='28' height='190' rx='14' fill='%23f8fafc' fill-opacity='0.5'/><rect x='316' y='292' width='148' height='16' rx='8' fill='%23facc15' fill-opacity='0.4'/></svg>",
    thumbnail: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='%230c1320'/><rect x='36' y='28' width='568' height='304' rx='24' fill='%2317222f'/><circle cx='250' cy='118' r='48' fill='%23edc19a'/><rect x='210' y='172' width='84' height='118' rx='28' fill='%232f6d8c'/><rect x='308' y='116' width='122' height='166' rx='24' fill='%233b82f6' fill-opacity='0.55'/><rect x='436' y='96' width='28' height='190' rx='14' fill='%23f8fafc' fill-opacity='0.5'/><rect x='316' y='292' width='148' height='16' rx='8' fill='%23facc15' fill-opacity='0.4'/></svg>",
    firstSeen: PREVIEW_TIME - 127000,
    lastSeen: PREVIEW_TIME,
    confirmed: false,
    seenCount: 4,
  },
  {
    key: "preview_3",
    id: "person_3",
    bbox: { x: 0, y: 0, w: 0, h: 0 },
    features: ["calm posture", "upright seated position", "alert gaze"],
    risk: "GREEN",
    description: "Patient remains upright, alert, and visually stable without obvious distress cues.",
    reason: "No visible signs of immediate escalation in this frame; continue routine monitoring.",
    cropBase64: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='%23091316'/><rect x='36' y='28' width='568' height='304' rx='24' fill='%2313272c'/><circle cx='220' cy='124' r='46' fill='%23eec4a0'/><rect x='182' y='176' width='76' height='118' rx='28' fill='%233a6d56'/><rect x='288' y='128' width='184' height='146' rx='28' fill='%2310b981' fill-opacity='0.38'/><rect x='294' y='286' width='192' height='18' rx='9' fill='%2334d399' fill-opacity='0.4'/></svg>",
    thumbnail: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='%23091316'/><rect x='36' y='28' width='568' height='304' rx='24' fill='%2313272c'/><circle cx='220' cy='124' r='46' fill='%23eec4a0'/><rect x='182' y='176' width='76' height='118' rx='28' fill='%233a6d56'/><rect x='288' y='128' width='184' height='146' rx='28' fill='%2310b981' fill-opacity='0.38'/><rect x='294' y='286' width='192' height='18' rx='9' fill='%2334d399' fill-opacity='0.4'/></svg>",
    firstSeen: PREVIEW_TIME - 56000,
    lastSeen: PREVIEW_TIME,
    confirmed: false,
    seenCount: 3,
  },
];

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
  const cfg = RISK_CONFIG[patient.risk];
  const accentColor = PERSON_COLORS[patient.id] ?? "#ffffff";
  const personNum = patient.id.replace("person_", "");
  const topFeature = patient.features[0];

  return (
    <div
      className={`overflow-hidden rounded-2xl border transition-all ${patient.confirmed ? "opacity-50" : ""} ${cfg.border} bg-slate-950/80 shadow-[0_12px_30px_rgba(2,6,23,0.32)]`}
    >
      <div className="flex h-full min-h-[224px] flex-col lg:flex-row">
        <div className="relative lg:w-[36%]">
          <div className="absolute inset-0 z-10 bg-gradient-to-tr from-slate-950/80 via-transparent to-transparent" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={patient.thumbnail} alt="" className="h-full min-h-[148px] w-full object-cover" />

          <div
            className="absolute left-3 top-3 z-20 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] backdrop-blur-sm"
            style={{ color: accentColor, borderColor: `${accentColor}66`, backgroundColor: `${accentColor}22` }}
          >
            Patient {personNum}
          </div>

          <div className={`absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] backdrop-blur-sm ${cfg.bg} ${cfg.border} ${cfg.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </div>

          <div className="absolute bottom-3 left-3 right-3 z-20 rounded-xl border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-md">
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-300">Visible Priority</p>
            <p className="mt-1 line-clamp-2 text-xs font-medium text-white">{topFeature ?? "No visible symptom detail"}</p>
          </div>

          {patient.confirmed && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/55">
              <span className="rounded-full border border-green-400/30 bg-green-500/15 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-green-200">
                Receiving care
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Current Status</p>
              <h3 className="mt-1.5 line-clamp-3 text-sm font-semibold leading-5 text-white">{patient.description}</h3>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-right">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">Seen</p>
              <p className="mt-1 text-xs font-mono text-slate-200">
                <ElapsedTimer since={patient.firstSeen} />
              </p>
            </div>
          </div>

          <div className="mb-3 rounded-xl border border-white/8 bg-white/[0.03] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Why This Needs Attention</p>
            <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-slate-300">{patient.reason}</p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Observed Symptoms</p>
            {patient.features.slice(0, 3).map((feature, index) => {
              const isCritical = index === 0 && featureSeverity(feature) >= 3;
              return (
                <span
                  key={feature}
                  className={`rounded-xl border px-3 py-1.5 text-xs leading-5 ${isCritical ? "border-red-500/40 bg-red-500/15 font-semibold text-red-100" : cfg.pill}`}
                >
                  {isCritical ? `High priority: ${feature}` : feature}
                </span>
              );
            })}
            {patient.features.length > 3 && (
              <span className="px-1 text-[11px] text-slate-500">
                +{patient.features.length - 3} more visible indicators
              </span>
            )}
          </div>

          <div className="mt-auto flex items-center gap-3 pt-4">
            <button
              onClick={() => onConfirm(patient.key)}
              className={`rounded-xl border px-3 py-2 text-xs font-medium transition-all cursor-pointer ${patient.confirmed ? "border-green-500/40 bg-green-500/10 text-green-300" : "border-white/10 bg-white/5 text-slate-200 hover:border-white/20 hover:bg-white/10"}`}
            >
              {patient.confirmed ? "Receiving care" : "Mark as receiving care"}
            </button>
            <div className="text-[11px] text-slate-500">
              Snapshot updates each time this person is re-detected.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props {
  patients: Patient[];
  onConfirm: (key: string) => void;
  mode: "demo" | "real";
}

export default function Dashboard({ patients, onConfirm, mode }: Props) {
  const usingPreview = mode === "demo";
  const sourcePatients = usingPreview ? PREVIEW_PATIENTS : patients;
  const active = sortByRisk(sourcePatients.filter((p) => !p.confirmed));
  const confirmed = patients.filter((p) => p.confirmed);
  const criticalCount = active.filter((p) => p.risk === "RED").length;
  const warningCount = active.filter((p) => p.risk === "YELLOW").length;
  const stableCount = active.filter((p) => p.risk === "GREEN").length;

  if (!usingPreview && patients.length === 0) {
    return (
      <div className="w-full">
        <div className="mb-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Triage Dashboard</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Real mode is ready for live detections.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Switch to the Sources tab and run an uploaded clip or live feed. As soon as detections arrive, patient cards
              will populate here in urgency order.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Current State</p>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-slate-300">
              No live patients detected yet. Use <span className="font-semibold text-white">Preview / Demo</span> to show the simulated dashboard, or stay in <span className="font-semibold text-white">Real Mode</span> for actual results only.
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/40 px-6 py-16 text-center">
          <p className="text-lg font-semibold text-white">Waiting for real incident data</p>
          <p className="mt-2 text-sm text-slate-400">No sample cards are shown in Real Mode.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-6 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Triage Dashboard</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Urgent patients surface first, with their snapshot and symptom summary side by side.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            Each card represents one detected person. The left side holds their most recent crop from the video feed,
            and the right side summarizes visible symptoms, explanation, and triage urgency.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Queue Summary</p>
          <div className="mt-4 flex items-center gap-3 text-sm text-slate-300">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span>{criticalCount} urgent case{criticalCount !== 1 ? "s" : ""}</span>
          </div>
          <div className="mt-2 flex items-center gap-3 text-sm text-slate-300">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span>{warningCount} concerning</span>
          </div>
          <div className="mt-2 flex items-center gap-3 text-sm text-slate-300">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span>{stableCount} stable</span>
          </div>
          {usingPreview && (
            <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
              Preview / Demo mode is showing sample patients so the dashboard is presentation-ready before the first upload or live run.
            </p>
          )}
        </div>
      </div>

      {criticalCount > 0 && (
        <div className="alert-flash mb-5 flex items-center gap-3 rounded-3xl border border-red-300/80 bg-red-500/25 px-4 py-4 shadow-[0_0_40px_rgba(248,113,113,0.35)]">
          <svg className="h-5 w-5 shrink-0 text-red-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-sm font-semibold text-red-50">
            Immediate attention recommended for {criticalCount} patient{criticalCount > 1 ? "s" : ""} based on the latest visible cues.
          </p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        {active.map((patient) => (
          <PatientCard key={patient.key} patient={patient} onConfirm={onConfirm} />
        ))}
      </div>

      {confirmed.length > 0 && (
        <div className="mt-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
            Receiving Treatment ({confirmed.length})
          </p>
          <div className="grid gap-4 xl:grid-cols-3">
            {confirmed.map((patient) => (
              <PatientCard key={patient.key} patient={patient} onConfirm={onConfirm} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

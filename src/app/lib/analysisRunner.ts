import { randomUUID } from "node:crypto";
import { insert, readTable, update } from "@/app/lib/storage";
import type { AnalysisEvent, EventType, Severity, Upload } from "@/app/lib/types";

export interface ProgressEntry {
  percent: number;
  message: string;
}

const globalAny = globalThis as unknown as {
  __analysisProgress?: Map<string, ProgressEntry>;
  __analysisRunning?: Set<string>;
};

const progressMap: Map<string, ProgressEntry> =
  globalAny.__analysisProgress ?? (globalAny.__analysisProgress = new Map());

const running: Set<string> = globalAny.__analysisRunning ?? (globalAny.__analysisRunning = new Set());

export function getProgress(uploadId: string): ProgressEntry {
  return progressMap.get(uploadId) ?? { percent: 0, message: "" };
}

function setProgress(uploadId: string, percent: number, message: string): void {
  progressMap.set(uploadId, { percent, message });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface StubEventSpec {
  patientLabel: string;
  eventType: EventType;
  severity: Severity;
  summary: string;
  symptoms: string[];
  confidence: number;
}

const STUB_EVENT_SPECS: StubEventSpec[] = [
  {
    patientLabel: "Patient 1",
    eventType: "normal",
    severity: "normal",
    summary: "Resting calmly in waiting-room chair, alert and oriented.",
    symptoms: ["calm", "alert"],
    confidence: 0.62,
  },
  {
    patientLabel: "Patient 2",
    eventType: "normal",
    severity: "normal",
    summary: "Reading magazine; vitals appear stable, no visible distress.",
    symptoms: ["alert", "stable posture"],
    confidence: 0.6,
  },
  {
    patientLabel: "Patient 1",
    eventType: "agitation",
    severity: "low",
    summary: "Mild restlessness; shifting position frequently and rubbing temple.",
    symptoms: ["fidgeting", "shifting posture", "headache cue"],
    confidence: 0.71,
  },
  {
    patientLabel: "Patient 2",
    eventType: "respiratory",
    severity: "moderate",
    summary: "Increased breathing rate and leaning forward; possible respiratory distress.",
    symptoms: ["tachypnea", "tripod posture"],
    confidence: 0.78,
  },
  {
    patientLabel: "Patient 1",
    eventType: "fall",
    severity: "urgent",
    summary: "Slipped from chair to floor; conscious but unable to rise without assistance.",
    symptoms: ["fall", "ground level", "unable to stand"],
    confidence: 0.86,
  },
  {
    patientLabel: "Patient 2",
    eventType: "cardiac",
    severity: "critical",
    summary: "Clutching chest with pallor and sweating; slumped against wall.",
    symptoms: ["chest pain", "pallor", "diaphoresis", "slumped posture"],
    confidence: 0.93,
  },
];

async function runStub(uploadId: string, durationSeconds: number): Promise<void> {
  const steps: Array<[number, string]> = [
    [25, "Extracting frames"],
    [50, "Sending to model"],
    [75, "Parsing detections"],
    [100, "Saving events"],
  ];
  for (const [percent, message] of steps) {
    setProgress(uploadId, percent, message);
    await sleep(1000);
  }

  const slice = durationSeconds / STUB_EVENT_SPECS.length;
  const window = Math.min(4, Math.max(1, slice));
  const createdAt = new Date().toISOString();

  for (let i = 0; i < STUB_EVENT_SPECS.length; i++) {
    const spec = STUB_EVENT_SPECS[i];
    const startTs = +(i * slice).toFixed(2);
    const endTs = +Math.min(durationSeconds, startTs + window).toFixed(2);
    const event: AnalysisEvent = {
      id: randomUUID(),
      uploadId,
      startTs,
      endTs,
      eventType: spec.eventType,
      severity: spec.severity,
      patientLabel: spec.patientLabel,
      summary: spec.summary,
      symptoms: spec.symptoms,
      confidence: spec.confidence,
      source: "upload",
      createdAt,
    };
    await insert<AnalysisEvent>("events", event);
  }
}

async function realAnalysis(_uploadId: string): Promise<void> {
  throw new Error("realAnalysis not implemented yet — set USE_STUB_WORKER=true for now");
}

async function runAnalysis(uploadId: string): Promise<void> {
  setProgress(uploadId, 0, "Starting");
  await update<Upload>("uploads", uploadId, { status: "analyzing" });

  try {
    const uploads = await readTable<Upload>("uploads");
    const upload = uploads.find((u) => u.id === uploadId);
    if (!upload) throw new Error(`Upload ${uploadId} not found`);

    const duration = upload.durationSeconds ?? 60;

    if (process.env.USE_STUB_WORKER === "true") {
      await runStub(uploadId, duration);
    } else {
      await realAnalysis(uploadId);
    }

    setProgress(uploadId, 100, "Complete");
    await update<Upload>("uploads", uploadId, { status: "done", error: undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[analysisRunner] ${uploadId} failed:`, message);
    setProgress(uploadId, 100, `Failed: ${message}`);
    try {
      await update<Upload>("uploads", uploadId, { status: "failed", error: message });
    } catch (writeErr) {
      console.error(`[analysisRunner] failed to mark upload as failed:`, writeErr);
    }
  } finally {
    running.delete(uploadId);
  }
}

export async function startAnalysis(uploadId: string): Promise<void> {
  if (running.has(uploadId)) return;
  running.add(uploadId);
  setProgress(uploadId, 0, "Queued");
  void runAnalysis(uploadId);
}

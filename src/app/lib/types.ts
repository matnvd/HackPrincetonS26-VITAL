export type Severity = "normal" | "low" | "moderate" | "urgent" | "critical";

export type EventType =
  | "choking"
  | "bleeding"
  | "seizure"
  | "cardiac"
  | "stroke"
  | "fall"
  | "respiratory"
  | "agitation"
  | "other"
  | "normal";

export type UploadStatus = "uploading" | "queued" | "analyzing" | "done" | "failed";

export interface Upload {
  id: string;
  filename: string;
  storagePath: string;
  durationSeconds?: number;
  status: UploadStatus;
  thumbnailPath?: string;
  error?: string;
  createdAt: string;
}

export interface AnalysisEvent {
  id: string;
  uploadId?: string;
  sessionId?: string;
  startTs: number;
  endTs: number;
  eventType: EventType;
  severity: Severity;
  patientLabel: string;
  summary: string;
  symptoms: string[];
  confidence: number;
  source: "upload" | "live";
  createdAt: string;
}

export interface LiveSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  status: "active" | "ended";
}

export const SEVERITY_COLOR: Record<Severity, string> = {
  normal: "#22c55e",
  low: "#84cc16",
  moderate: "#eab308",
  urgent: "#f97316",
  critical: "#ef4444",
};

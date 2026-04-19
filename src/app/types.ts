export type TriageLevel = "CRITICAL" | "URGENT" | "STABLE" | "MONITORING";

export interface Patient {
  id: string;
  location: string;
  posture: string;
  movement: string;
  visible_distress: boolean;
  triage: TriageLevel;
  reason: string;
  confidence: number;
  firstSeen: string;
  lastSeen: string;
  cameraLabel: string;
}

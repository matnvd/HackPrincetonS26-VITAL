import type { AnalysisEvent } from "@/app/lib/types";

export interface AlertResult {
  ok: boolean;
  channel: "console" | "twilio" | "elevenlabs";
  message: string;
}

/**
 * Stub implementation. Prompt 8 will wire this to Twilio + ElevenLabs.
 * For now we just log to the console so the calling code path is exercised.
 * If MOCK_ALERTS=true (the default for local dev), this stays a no-op aside
 * from the log line.
 */
export async function sendAlert(event: AnalysisEvent): Promise<AlertResult> {
  const line = `[ALERT][${event.severity.toUpperCase()}] ${event.patientLabel} — ${event.eventType}: ${event.summary}`;
  console.log(line);
  return { ok: true, channel: "console", message: line };
}

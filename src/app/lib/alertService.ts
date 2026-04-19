import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ALERTS_DIR } from "@/app/lib/storage";
import { publish } from "@/app/lib/sessionBus";
import type { AnalysisEvent } from "@/app/lib/types";

const DEDUPE_WINDOW_MS = 60_000;

const globalAny = globalThis as unknown as {
  __alertDedupe?: Map<string, number>;
};

const dedupe: Map<string, number> =
  globalAny.__alertDedupe ?? (globalAny.__alertDedupe = new Map());

function formatMmSs(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function smsBody(event: AnalysisEvent): string {
  const ts = formatMmSs(event.startTs);
  const prefix = event.severity.toUpperCase();
  return `${prefix}: ${event.patientLabel} — ${event.eventType}. ${event.summary} at ${ts}.`;
}

function ttsBody(event: AnalysisEvent): string {
  return `Critical alert. ${event.patientLabel}. ${event.summary}.`;
}

async function sendTwilioSms(event: AnalysisEvent): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = process.env.NURSE_PHONE;

  if (!sid || !token || !from || !to) {
    console.warn(
      "[alertService] Twilio env vars missing (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, NURSE_PHONE); skipping SMS",
    );
    return;
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const body = new URLSearchParams({
    To: to,
    From: from,
    Body: smsBody(event),
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Twilio ${res.status}: ${text.slice(0, 200)}`);
  }
  console.log(`[alertService] SMS sent to ${to.slice(-4).padStart(to.length, "*")}`);
}

async function sendElevenLabsTts(event: AnalysisEvent): Promise<string | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    console.warn(
      "[alertService] ElevenLabs env vars missing (ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID); skipping TTS",
    );
    return null;
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: ttsBody(event),
        model_id: "eleven_turbo_v2_5",
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status}: ${text.slice(0, 200)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const filename = `${randomUUID()}.mp3`;
  await fs.mkdir(ALERTS_DIR, { recursive: true });
  await fs.writeFile(path.join(ALERTS_DIR, filename), buf);
  console.log(`[alertService] TTS saved ${filename} (${buf.length} bytes)`);
  return filename;
}

export async function sendAlert(event: AnalysisEvent): Promise<void> {
  if (event.severity !== "critical" && event.severity !== "urgent") return;

  const dedupeKey = `${event.patientLabel}:${event.eventType}`;
  const lastSent = dedupe.get(dedupeKey);
  const now = Date.now();
  if (lastSent && now - lastSent < DEDUPE_WINDOW_MS) {
    console.log(
      `[alertService] dedupe (${Math.round((now - lastSent) / 1000)}s ago) skipping ${dedupeKey}`,
    );
    return;
  }
  dedupe.set(dedupeKey, now);

  // Mock by default to protect API credits. Set MOCK_ALERTS=false to actually
  // hit Twilio/ElevenLabs (and put credentials in .env.local).
  if (process.env.MOCK_ALERTS !== "false") {
    console.log(
      `[MOCK ALERT][${event.severity.toUpperCase()}] ${event.patientLabel} — ${event.eventType}: ${event.summary} (sms${
        event.severity === "critical" ? " + tts" : ""
      })`,
    );
    return;
  }

  try {
    await sendTwilioSms(event);
  } catch (err) {
    console.error("[alertService] Twilio SMS failed:", err instanceof Error ? err.message : err);
  }

  if (event.severity === "critical") {
    try {
      const filename = await sendElevenLabsTts(event);
      if (filename && event.sessionId) {
        publish(event.sessionId, { type: "play_alert", data: { audioPath: filename } });
      }
    } catch (err) {
      console.error(
        "[alertService] ElevenLabs TTS failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}

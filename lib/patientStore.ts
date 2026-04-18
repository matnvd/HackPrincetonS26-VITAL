export type RiskLevel = "GREEN" | "YELLOW" | "RED";

export interface DetectedPerson {
  id: string;
  observation: string; // Gemini's raw chain-of-thought clinical notes
  condition: string;
  symptoms: string[];
  risk: RiskLevel;
  reason: string;
}

export interface Patient extends DetectedPerson {
  key: string;       // normalized id used for dedup
  thumbnail: string; // base64 of frame they were first seen in
  firstSeen: number;
  lastSeen: number;
  confirmed: boolean;
  seenCount: number;
}

const RISK_RANK: Record<RiskLevel, number> = { GREEN: 0, YELLOW: 1, RED: 2 };

// Strip stopwords and short tokens, return significant words for matching
function significant(s: string): string[] {
  const stop = new Set(["a", "an", "the", "in", "on", "with", "and", "or", "of", "wearing", "has", "is", "are"]);
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
}

function samePatient(a: string, b: string): boolean {
  const wa = significant(a);
  const wb = significant(b);
  const overlap = wa.filter((w) => wb.includes(w));
  return overlap.length >= 2;
}

export function mergePatients(
  existing: Patient[],
  incoming: DetectedPerson[],
  frameBase64: string
): Patient[] {
  const now = Date.now();
  const next = existing.map((p) => ({ ...p }));

  for (const person of incoming) {
    const idx = next.findIndex((p) => !p.confirmed && samePatient(p.id, person.id));

    if (idx >= 0) {
      const p = next[idx];
      const escalating = RISK_RANK[person.risk] >= RISK_RANK[p.risk];
      next[idx] = {
        ...p,
        observation: person.observation, // always use latest clinical notes
        condition:   person.condition,
        symptoms:    Array.from(new Set([...p.symptoms, ...person.symptoms])),
        // Only escalate risk, never downgrade
        risk:   escalating ? person.risk   : p.risk,
        reason: escalating ? person.reason : p.reason,
        lastSeen: now,
        seenCount: p.seenCount + 1,
      };
    } else {
      next.push({
        ...person,
        key: significant(person.id).join(" "),
        thumbnail: frameBase64,
        firstSeen: now,
        lastSeen: now,
        confirmed: false,
        seenCount: 1,
      });
    }
  }

  return next;
}

export function sortByRisk(patients: Patient[]): Patient[] {
  return [...patients].sort((a, b) => RISK_RANK[b.risk] - RISK_RANK[a.risk]);
}

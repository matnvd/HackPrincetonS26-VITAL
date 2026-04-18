export type RiskLevel = "GREEN" | "YELLOW" | "RED";

export interface DetectedPerson {
  id: string;
  observation: string;
  condition: string;
  symptoms: string[];
  risk: RiskLevel;
  reason: string;
}

export interface Patient extends DetectedPerson {
  key: string;
  thumbnail: string;
  firstSeen: number;
  lastSeen: number;
  confirmed: boolean;
  seenCount: number;
}

const RISK_RANK: Record<RiskLevel, number> = { GREEN: 0, YELLOW: 1, RED: 2 };

// Pairs where only one can be true at a time — keep the more alarming one
const CONTRADICTION_PAIRS: [string, string][] = [
  ["conscious",           "unconscious"],
  ["alert",               "unresponsive"],
  ["alert and oriented",  "altered consciousness"],
  ["responsive",          "unresponsive"],
  ["breathing normally",  "respiratory arrest"],
  ["breathing normally",  "absent breathing"],
  ["breathing normally",  "labored breathing"],
  ["breathing normally",  "agonal breathing"],
  ["ambulatory",          "immobile"],
  ["ambulatory",          "lying"],
  ["ambulatory",          "supine"],
  ["stable",              "decompensating"],
  ["normal skin color",   "pallor"],
  ["normal skin color",   "cyanosis"],
  ["no distress",         "acute distress"],
  ["oriented",            "confused"],
  ["oriented",            "disoriented"],
];

function removeSelf(s: string): boolean {
  // Filter out vague/useless entries
  const bad = ["none", "n/a", "unknown", "normal", "stable"];
  return !bad.includes(s.toLowerCase().trim());
}

/** Remove symptoms that contradict any symptom in `dominant` list */
function filterContradictions(base: string[], dominant: string[]): string[] {
  return base.filter((sym) => {
    const symL = sym.toLowerCase();
    for (const [a, b] of CONTRADICTION_PAIRS) {
      const inDominant = dominant.some((d) => d.toLowerCase().includes(a) || d.toLowerCase().includes(b));
      const symIsOther = symL.includes(a) || symL.includes(b);
      if (inDominant && symIsOther) {
        // Check if sym itself is already in dominant (keep it) or is the opposite (remove it)
        const symInDominant = dominant.some((d) => d.toLowerCase() === symL);
        if (!symInDominant) return false;
      }
    }
    return true;
  });
}

/** Merge two symptom lists, letting `fresh` take precedence on contradictions */
function mergeSymptoms(existing: string[], fresh: string[]): string[] {
  const cleanFresh = fresh.filter(removeSelf);
  // Keep existing symptoms that don't contradict the fresh list
  const surviving = filterContradictions(existing, cleanFresh);
  // Union, dedup by lowercased value
  const seen = new Set(cleanFresh.map((s) => s.toLowerCase()));
  for (const s of surviving) {
    if (!seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      cleanFresh.push(s);
    }
  }
  return cleanFresh;
}

// ── Severity ordering ─────────────────────────────────────────────────────────
// Higher number = shown first

const SEVERITY_KEYWORDS: [number, string[]][] = [
  [5, ["cardiac arrest", "respiratory arrest", "not breathing", "absent breathing", "agonal", "unconscious", "unresponsive", "choking", "airway obstruction", "anaphylaxis", "hemorrhage", "exsanguinating"]],
  [4, ["cyanosis", "cyanotic", "pallor", "diaphoresis", "seizure", "decompensated shock", "gcs"]],
  [3, ["labored breathing", "tachypnea", "altered consciousness", "altered mental", "stroke", "facial droop", "arm weakness"]],
  [2, ["tachycardia", "hypotension", "chest pain", "abdominal guarding", "severe pain", "vomiting blood"]],
  [1, ["moderate", "distress", "confusion", "disoriented", "nausea", "weakness", "swelling"]],
];

export function symptomSeverity(symptom: string): number {
  const s = symptom.toLowerCase();
  for (const [score, keywords] of SEVERITY_KEYWORDS) {
    if (keywords.some((k) => s.includes(k))) return score;
  }
  return 0;
}

export function sortSymptoms(symptoms: string[]): string[] {
  return [...symptoms].sort((a, b) => symptomSeverity(b) - symptomSeverity(a));
}

// ── Identity matching ──────────────────────────────────────────────────────────

function significant(s: string): string[] {
  const stop = new Set(["a", "an", "the", "in", "on", "with", "and", "or", "of", "wearing", "has", "is", "are"]);
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
}

function samePatient(a: string, b: string): boolean {
  const wa = significant(a);
  const wb = significant(b);
  return wa.filter((w) => wb.includes(w)).length >= 2;
}

// ── Merge ──────────────────────────────────────────────────────────────────────

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
        observation: person.observation,
        condition:   person.condition,
        // When risk escalates, fresh symptoms take full precedence.
        // When same level, merge but let fresh list win contradictions.
        symptoms: escalating
          ? sortSymptoms(mergeSymptoms(p.symptoms, person.symptoms))
          : sortSymptoms(mergeSymptoms(person.symptoms, p.symptoms)),
        risk:   escalating ? person.risk   : p.risk,
        reason: escalating ? person.reason : p.reason,
        lastSeen: now,
        seenCount: p.seenCount + 1,
      };
    } else {
      next.push({
        ...person,
        symptoms: sortSymptoms(person.symptoms.filter(removeSelf)),
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

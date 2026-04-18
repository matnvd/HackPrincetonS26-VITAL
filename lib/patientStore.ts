export type RiskLevel = "GREEN" | "YELLOW" | "RED";

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DetectedPerson {
  id: string;
  bbox: BBox;
  features: string[];
  risk: RiskLevel;
  description: string;
  reason: string;
  cropBase64: string;
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

const SEVERITY_KEYWORDS: [number, string[]][] = [
  [5, ["cardiac arrest", "respiratory arrest", "not breathing", "absent breathing", "agonal", "unconscious", "unresponsive", "choking", "airway obstruction", "hemorrhage"]],
  [4, ["cyanosis", "cyanotic", "pallor", "diaphoresis", "seizure", "decompensated shock"]],
  [3, ["labored breathing", "tachypnea", "altered consciousness", "stroke", "facial droop"]],
  [2, ["tachycardia", "chest pain", "abdominal guarding", "severe pain"]],
  [1, ["moderate", "distress", "confusion", "disoriented", "nausea", "weakness"]],
];

export function featureSeverity(feature: string): number {
  const s = feature.toLowerCase();
  for (const [score, keywords] of SEVERITY_KEYWORDS) {
    if (keywords.some((k) => s.includes(k))) return score;
  }
  return 0;
}

// Keep alias for any remaining Dashboard references
export const symptomSeverity = featureSeverity;

export function sortFeatures(features: string[]): string[] {
  return [...features].sort((a, b) => featureSeverity(b) - featureSeverity(a));
}

function samePatient(a: string, b: string): boolean {
  if (a === b) return true;
  const stop = new Set(["a", "an", "the", "in", "on", "with", "and", "or", "of"]);
  const words = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !stop.has(w));
  const wa = words(a);
  const wb = words(b);
  return wa.filter((w) => wb.includes(w)).length >= 2;
}

export function mergePatients(
  existing: Patient[],
  incoming: DetectedPerson[],
  _frameBase64: string
): Patient[] {
  const now = Date.now();
  const next = existing.map((p) => ({ ...p }));

  for (const person of incoming) {
    const idx = next.findIndex((p) => !p.confirmed && samePatient(p.id, person.id));

    if (idx >= 0) {
      const p = next[idx];
      const escalating = RISK_RANK[person.risk] >= RISK_RANK[p.risk];
      const merged = sortFeatures([...new Set([...(escalating ? person.features : p.features), ...(escalating ? p.features : person.features)])]);

      next[idx] = {
        ...p,
        bbox: person.bbox,
        features: merged,
        risk: escalating ? person.risk : p.risk,
        description: escalating ? person.description : p.description,
        reason: escalating ? person.reason : p.reason,
        cropBase64: person.cropBase64,
        thumbnail: person.cropBase64,
        lastSeen: now,
        seenCount: p.seenCount + 1,
      };
    } else {
      next.push({
        ...person,
        features: sortFeatures(person.features),
        key: person.id,
        thumbnail: person.cropBase64,
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

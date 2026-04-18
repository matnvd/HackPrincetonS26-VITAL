import type { Patient } from "@/lib/patientStore";

const DEMO_SPECS = [
  {
    key: "preview_1",
    id: "person_1",
    risk: "RED" as const,
    features: ["labored breathing", "hand on chest", "slumped posture"],
    description: "Adult seated forward with visible respiratory strain and limited responsiveness.",
    reason: "Posture and breathing pattern suggest acute distress and require immediate in-person assessment.",
    minutesAgo: 7,
    seenCount: 2,
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='%230d1320'/><rect x='36' y='28' width='568' height='304' rx='24' fill='%23182133'/><circle cx='220' cy='130' r='54' fill='%23f2c9a5'/><rect x='168' y='192' width='108' height='102' rx='34' fill='%239b4b3e'/><rect x='286' y='124' width='164' height='142' rx='26' fill='%23b24545'/><rect x='312' y='92' width='88' height='22' rx='11' fill='%23ef4444' fill-opacity='0.65'/><rect x='298' y='286' width='196' height='18' rx='9' fill='%23f59e0b' fill-opacity='0.38'/></svg>",
  },
  {
    key: "preview_2",
    id: "person_2",
    risk: "YELLOW" as const,
    features: ["dizziness", "leaning on support", "reduced balance"],
    description: "Standing adult appears unsteady and intermittently braces against nearby furniture.",
    reason: "Balance changes and guarded stance may indicate worsening fatigue, pain, or near-syncope.",
    minutesAgo: 4,
    seenCount: 4,
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='%230c1320'/><rect x='36' y='28' width='568' height='304' rx='24' fill='%2317222f'/><circle cx='250' cy='118' r='48' fill='%23edc19a'/><rect x='210' y='172' width='84' height='118' rx='28' fill='%232f6d8c'/><rect x='308' y='116' width='122' height='166' rx='24' fill='%233b82f6' fill-opacity='0.55'/><rect x='436' y='96' width='28' height='190' rx='14' fill='%23f8fafc' fill-opacity='0.5'/><rect x='316' y='292' width='148' height='16' rx='8' fill='%23facc15' fill-opacity='0.4'/></svg>",
  },
  {
    key: "preview_3",
    id: "person_3",
    risk: "GREEN" as const,
    features: ["calm posture", "upright seated position", "alert gaze"],
    description: "Patient remains upright, alert, and visually stable without obvious distress cues.",
    reason: "No visible signs of immediate escalation in this frame; continue routine monitoring.",
    minutesAgo: 2,
    seenCount: 3,
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='%23091316'/><rect x='36' y='28' width='568' height='304' rx='24' fill='%2313272c'/><circle cx='220' cy='124' r='46' fill='%23eec4a0'/><rect x='182' y='176' width='76' height='118' rx='28' fill='%233a6d56'/><rect x='288' y='128' width='184' height='146' rx='28' fill='%2310b981' fill-opacity='0.38'/><rect x='294' y='286' width='192' height='18' rx='9' fill='%2334d399' fill-opacity='0.4'/></svg>",
  },
  {
    key: "preview_4",
    id: "person_4",
    risk: "YELLOW" as const,
    features: ["holding abdomen", "guarded movement", "pain expression"],
    description: "Patient walks slowly with guarding around the abdomen and intermittent pauses.",
    reason: "Guarding and slowed movement may indicate escalating pain that should be reassessed soon.",
    minutesAgo: 5,
    seenCount: 2,
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='%23101426'/><rect x='36' y='28' width='568' height='304' rx='24' fill='%23181d38'/><circle cx='228' cy='120' r='48' fill='%23efc49d'/><rect x='190' y='172' width='80' height='116' rx='28' fill='%238b5cf6' fill-opacity='0.55'/><rect x='294' y='126' width='162' height='148' rx='26' fill='%23f59e0b' fill-opacity='0.2'/><rect x='314' y='286' width='146' height='16' rx='8' fill='%23f59e0b' fill-opacity='0.45'/></svg>",
  },
  {
    key: "preview_5",
    id: "person_5",
    risk: "RED" as const,
    features: ["unresponsive posture", "head tilted back", "minimal movement"],
    description: "Adult is reclined with minimal visible movement and poor postural control.",
    reason: "Minimal movement and apparent poor responsiveness require immediate direct evaluation.",
    minutesAgo: 9,
    seenCount: 1,
    image: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='%23110f18'/><rect x='36' y='28' width='568' height='304' rx='24' fill='%231f1a2e'/><circle cx='220' cy='126' r='46' fill='%23e9c29d'/><rect x='176' y='178' width='88' height='104' rx='28' fill='%239433ea' fill-opacity='0.38'/><rect x='286' y='142' width='188' height='118' rx='24' fill='%23ef4444' fill-opacity='0.24'/><rect x='302' y='286' width='184' height='16' rx='8' fill='%23ef4444' fill-opacity='0.42'/></svg>",
  },
];

export function getDemoPatients(): Patient[] {
  const now = Date.now();

  return DEMO_SPECS.map((spec) => ({
    key: spec.key,
    id: spec.id,
    bbox: { x: 0, y: 0, w: 0, h: 0 },
    features: spec.features,
    risk: spec.risk,
    description: spec.description,
    reason: spec.reason,
    cropBase64: spec.image,
    thumbnail: spec.image,
    firstSeen: now - spec.minutesAgo * 60 * 1000,
    lastSeen: now,
    confirmed: false,
    seenCount: spec.seenCount,
  }));
}

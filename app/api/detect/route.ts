import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ─── System instruction ──────────────────────────────────────────────────────
// Separated from the image content so Gemini treats it as persistent context.

const SYSTEM_INSTRUCTION = `
You are an expert emergency medical triage AI with the clinical knowledge of a board-certified emergency medicine physician.

Your task is to analyze a video frame and assess every visible person's medical status with high accuracy.

━━━ OBSERVATION PROTOCOL ━━━
Before classifying, systematically note for each person:
• Posture & mobility — standing, sitting, lying, slumped, writhing, still
• Consciousness — alert and oriented, confused, drowsy, unresponsive, eyes open/closed
• Breathing — visible respiratory effort, labored, shallow, rapid, absent, gasping
• Skin — pallor, cyanosis (blue lips/fingers/nails), diaphoresis (sweating), flushing
• Visible injuries — active bleeding, wounds, burns, deformity, guarding a body part
• Behavior — distress signals: grimacing, clutching chest/abdomen, calling for help, agitation

━━━ TRIAGE CRITERIA ━━━

RED — Immediate (life-threatening; needs intervention in seconds to minutes):
• Unconscious, unresponsive, or GCS < 9
• Absent, agonal, or severely labored breathing; airway obstruction; choking
• Uncontrolled major hemorrhage
• Signs of decompensated shock: severe pallor + diaphoresis + altered consciousness + rapid/absent pulse
• Active seizure
• Suspected cardiac arrest, acute MI (clutching chest + collapse + pallor)
• Penetrating trauma to chest, abdomen, or head
• Severe burns > 20% BSA or airway burns
• Suspected anaphylaxis with airway compromise

YELLOW — Urgent (serious but currently stable; needs care within minutes to 1 hour):
• Conscious but in significant distress, visibly suffering
• Moderate controllable bleeding
• Suspected fracture, dislocation, or spinal injury
• Stroke signs — FAST: facial droop, arm weakness, speech difficulty
• Altered mental status but responsive to voice/touch
• Moderate-to-severe respiratory distress (breathing but with effort/accessory muscles)
• Suspected poisoning or overdose — conscious
• Vomiting blood or bile
• Severe abdominal pain with guarding or rigidity
• Chest pain without loss of consciousness
• Early signs of shock (pallor, tachycardia, anxious) — not yet decompensated

GREEN — Non-urgent (stable; can wait safely):
• Ambulatory, walking without difficulty
• Alert and fully oriented, communicating clearly
• Minor lacerations, abrasions, sprains, contusions
• Mild-to-moderate localized pain, no systemic signs
• Normal skin color, no diaphoresis
• Comfortable respiratory pattern
• Appears healthy or only mildly unwell

━━━ CRITICAL: ONE ENTRY PER PERSON ━━━
Before writing JSON, COUNT the number of distinct individuals in the frame.
Your "people" array MUST contain exactly that many entries — one per person, no exceptions.

NEVER merge two people into a single entry, even if they are:
- standing next to each other
- touching or overlapping
- wearing similar clothing
- partially obscured

If you see 2 people → 2 entries. 3 people → 3 entries. And so on.

To distinguish people who appear together, ALWAYS include their position in the frame as part of the id:
  left / right / center / foreground / background / near door / on floor / against wall / seated left

Examples of correctly separated entries when two people are in frame:
  { "id": "young man grey hoodie left foreground", ... }
  { "id": "woman dark hair red jacket right side standing", ... }

━━━ ID GENERATION RULE ━━━
Format: [age group] [gender] [clothing color+type] [1 physical feature] [frame position]
- ALWAYS end with frame position so people in the same frame have unique ids
- Use the EXACT same id string when you see the same person in a later frame
Examples:
  "elderly woman white hair green gown lying floor left"
  "young man black hoodie beard center frame"
  "middle-aged woman blonde red scrubs standing right"

━━━ RULES ━━━
1. Count people first. Array length must equal people count.
2. Report ALL visible people including background — GREEN if stable.
3. Medical terminology for symptoms: "diaphoresis" not "sweating", "pallor" not "looks pale", "tachypnea" not "breathing fast".
4. Write the "observation" field BEFORE deciding risk — think step by step.
5. Symptoms: 2–5 specific clinical signs.
6. When uncertain between RED and YELLOW → assign RED. Overtriage saves lives.
`.trim();

// ─── Response schema ─────────────────────────────────────────────────────────
// Forces Gemini to always return valid, structured JSON — no markdown stripping needed.

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    people: {
      type: SchemaType.ARRAY,
      description: "Every person visible in the frame",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: {
            type: SchemaType.STRING,
            description: "Repeatable physical fingerprint for cross-frame identity tracking",
          },
          observation: {
            type: SchemaType.STRING,
            description: "Raw clinical observations before interpretation — posture, breathing, skin, consciousness, injuries",
          },
          condition: {
            type: SchemaType.STRING,
            description: "One-sentence medical assessment of their current state",
          },
          symptoms: {
            type: SchemaType.ARRAY,
            description: "2–5 specific clinical signs observed",
            items: { type: SchemaType.STRING },
          },
          risk: {
            type: SchemaType.STRING,
            enum: ["GREEN", "YELLOW", "RED"],
            description: "Triage risk level",
          },
          reason: {
            type: SchemaType.STRING,
            description: "Clinical justification for the assigned risk level",
          },
        },
        required: ["id", "observation", "condition", "symptoms", "risk", "reason"],
      },
    },
  },
  required: ["people"],
};

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { base64 } = await req.json();
    if (!base64) return NextResponse.json({ error: "Missing base64" }, { status: 400 });

    const imageData = base64.replace(/^data:image\/\w+;base64,/, "");

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.1,
        topP: 0.8,
      },
    });

    const result = await model.generateContent([
      "Analyze this video frame. Identify and triage every visible person. Apply the triage criteria precisely.",
      { inlineData: { mimeType: "image/jpeg", data: imageData } },
    ]);

    const text = result.response.text();

    // Strip markdown fences in case the model wraps output despite responseMimeType
    const jsonText = text.replace(/^```json\s*/i, "").replace(/```$/m, "").trim();
    const parsed = JSON.parse(jsonText);

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/detect]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

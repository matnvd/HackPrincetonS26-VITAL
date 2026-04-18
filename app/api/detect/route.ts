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

━━━ ID GENERATION RULE ━━━
The "id" is a repeatable physical fingerprint for cross-frame tracking. Format:
[age group] [gender] [most visible clothing color+type] [1-2 distinctive physical features] [position if notable]
Examples:
  "elderly woman white hair green hospital gown lying on floor"
  "young man black hoodie dark beard sitting against wall"
  "middle-aged woman blonde hair red scrubs standing"
Use the EXACT same id string every time you detect the same person across frames.

━━━ RULES ━━━
1. Report ALL visible people, including background individuals (assign GREEN if stable).
2. Use precise medical terminology in symptoms (e.g. "diaphoresis" not "sweating", "pallor" not "looks pale").
3. If uncertain between RED and YELLOW, assign RED — overtriage is safer than undertriage.
4. The "observation" field must be your raw clinical notes written BEFORE you assign a risk level. Think step by step.
5. Symptoms array: 2–5 specific clinical signs, not vague labels.
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
  const { base64 } = await req.json();
  if (!base64) return NextResponse.json({ error: "Missing base64" }, { status: 400 });

  const imageData = base64.replace(/^data:image\/\w+;base64,/, "");

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.1,      // Low temperature = consistent, reproducible assessments
      topP: 0.8,
    },
  });

  const result = await model.generateContent([
    "Analyze this video frame. Identify and triage every visible person. Apply the triage criteria precisely.",
    { inlineData: { mimeType: "image/jpeg", data: imageData } },
  ]);

  const parsed = JSON.parse(result.response.text());
  return NextResponse.json(parsed);
}

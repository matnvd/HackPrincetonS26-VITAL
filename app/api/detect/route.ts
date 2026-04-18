import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_INSTRUCTION = `
You are an expert emergency medical triage AI with the clinical knowledge of a board-certified emergency medicine physician.

This image shows a SINGLE PERSON, already cropped from a larger scene. Your task is to assess this one person's medical status.

━━━ OBSERVATION PROTOCOL ━━━
Systematically note:
• Posture & mobility — standing, sitting, lying, slumped, writhing, still
• Consciousness — alert, confused, drowsy, unresponsive, eyes open/closed
• Breathing — visible respiratory effort, labored, shallow, rapid, absent, gasping
• Skin — pallor, cyanosis (blue lips/fingers/nails), diaphoresis, flushing
• Visible injuries — active bleeding, wounds, burns, deformity
• Behavior — grimacing, clutching chest/abdomen, calling for help, agitation

━━━ TRIAGE CRITERIA ━━━

RED — Immediate (life-threatening):
• Unconscious, unresponsive, or GCS < 9
• Absent, agonal, or severely labored breathing; airway obstruction; choking
• Uncontrolled major hemorrhage
• Signs of decompensated shock: severe pallor + diaphoresis + altered consciousness
• Active seizure
• Suspected cardiac arrest, acute MI
• Penetrating trauma to chest, abdomen, or head

YELLOW — Urgent (serious but stable):
• Conscious but in significant distress
• Moderate controllable bleeding
• Suspected fracture, dislocation, or spinal injury
• Stroke signs — facial droop, arm weakness, speech difficulty
• Altered mental status but responsive
• Moderate-to-severe respiratory distress
• Chest pain without loss of consciousness

GREEN — Non-urgent (stable):
• Ambulatory, walking without difficulty
• Alert and fully oriented
• Minor lacerations, abrasions, sprains
• Normal skin color, comfortable breathing

━━━ RULES ━━━
1. Report ONLY what you can directly observe in this cropped image.
2. When uncertain between RED and YELLOW → assign RED. Overtriage saves lives.
3. features: 2–5 specific visible signs, ordered from most to least severe.
4. description: one clear sentence summarizing the person's medical state.
5. NEVER include contradictory features (e.g., "conscious" AND "unconscious").
`.trim();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RESPONSE_SCHEMA: any = {
  type: SchemaType.OBJECT,
  properties: {
    description: {
      type: SchemaType.STRING,
      description: "One-sentence medical assessment of this person's current state",
    },
    features: {
      type: SchemaType.ARRAY,
      description: "2–5 specific visible signs ordered from most to least severe",
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
  required: ["description", "features", "risk", "reason"],
};

function parse429Delay(message: string): number | null {
  const match = message.match(/retry in ([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1]) * 1000) + 500 : null;
}

async function generateWithRetry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  content: unknown[],
  maxAttempts = 3
): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await model.generateContent(content);
      return result.response.text();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes("429");
      if (is429 && attempt < maxAttempts) {
        const delay = parse429Delay(msg) ?? 15_000;
        console.warn(`[/api/detect] 429 on attempt ${attempt}, retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error("Max retries exceeded");
}

export async function POST(req: NextRequest) {
  try {
    const { base64, apiKey, liveMode } = await req.json();
    if (!base64) return NextResponse.json({ error: "Missing base64" }, { status: 400 });

    const imageData = base64.replace(/^data:image\/\w+;base64,/, "");

    const client = apiKey ? new GoogleGenerativeAI(apiKey) : genAI;
    const model = client.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.1,
        topP: 0.8,
      },
    });

    // liveMode=true: fail fast (1 attempt) so the camera loop moves on quickly
    const maxAttempts = liveMode ? 1 : 3;
    const text = await generateWithRetry(model, [
      "Analyze this person and provide a triage assessment. Observe their posture, consciousness, breathing, skin, and any visible injuries or distress.",
      { inlineData: { mimeType: "image/jpeg", data: imageData } },
    ], maxAttempts);

    const jsonText = text.replace(/^```json\s*/i, "").replace(/```$/m, "").trim();
    return NextResponse.json(JSON.parse(jsonText));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/detect]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

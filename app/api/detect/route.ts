import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "placeholder");

// ─── Shared prompt ────────────────────────────────────────────────────────────

const TRIAGE_PROMPT = `You are an expert emergency medical triage AI.
This image shows a SINGLE PERSON. Assess their medical status.

Observe:
• Posture — standing, sitting, lying, slumped, hunched, shaking, falling
• Consciousness — alert, confused, drowsy, unresponsive
• Breathing — normal, labored, shallow, rapid, absent
• Skin — pallor, cyanosis, diaphoresis
• Injuries — bleeding, wounds, burns, deformity
• Behavior — grimacing, clutching chest/abdomen, agitation, distress

Triage levels:
RED = life-threatening (unconscious, no breathing, severe hemorrhage, seizure, shock)
YELLOW = urgent but stable (significant distress, moderate bleeding, stroke signs, chest pain)
GREEN = stable (alert, ambulatory, minor issues only)

When uncertain RED vs YELLOW → assign RED. Overtriage saves lives.

Respond with ONLY valid JSON, no markdown:
{"description":"one sentence assessment","features":["feature1","feature2"],"risk":"GREEN","reason":"clinical justification"}`;

// ─── Gemini ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GEMINI_SCHEMA: any = {
  type: SchemaType.OBJECT,
  properties: {
    description: { type: SchemaType.STRING },
    features:    { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    risk:        { type: SchemaType.STRING, enum: ["GREEN", "YELLOW", "RED"] },
    reason:      { type: SchemaType.STRING },
  },
  required: ["description", "features", "risk", "reason"],
};

function isZeroQuota(msg: string) {
  return msg.includes("limit: 0") || (msg.includes("429") && msg.includes("limit: 0"));
}

async function callGemini(imageData: string, apiKey?: string): Promise<string> {
  const client = apiKey ? new GoogleGenerativeAI(apiKey) : genAI;
  const model = client.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: TRIAGE_PROMPT,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GEMINI_SCHEMA,
      temperature: 0.1,
    },
  });
  const result = await model.generateContent([
    "Analyze this person's triage status.",
    { inlineData: { mimeType: "image/jpeg", data: imageData } },
  ]);
  return result.response.text();
}

// ─── Together AI (fallback) ───────────────────────────────────────────────────
// Free $25 credits on signup at api.together.ai — no credit card required.
// Model: Llama 3.2 11B Vision, supports image input.

async function callTogetherAI(imageData: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: TRIAGE_PROMPT + "\n\nIMPORTANT: Reply with ONLY the JSON object, nothing else." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageData}` } },
          ],
        },
      ],
      max_tokens: 300,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Together AI ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { base64, apiKey, togetherKey, liveMode } = await req.json();
    if (!base64) return NextResponse.json({ error: "Missing base64" }, { status: 400 });

    const imageData = base64.replace(/^data:image\/\w+;base64,/, "");

    let rawText = "";
    let usedProvider = "gemini";

    // ── Try Gemini first ────────────────────────────────────────────────────
    try {
      rawText = await callGemini(imageData, apiKey || undefined);
    } catch (geminiErr) {
      const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
      const quotaBlocked = isZeroQuota(msg) || (msg.includes("429") && liveMode);

      // ── Fall back to Together AI if Gemini is quota-blocked ───────────────
      const fallbackKey = togetherKey || process.env.TOGETHER_API_KEY;
      if (quotaBlocked && fallbackKey) {
        console.warn("[/api/detect] Gemini quota blocked, trying Together AI");
        usedProvider = "together";
        rawText = await callTogetherAI(imageData, fallbackKey);
      } else {
        throw geminiErr;
      }
    }

    // ── Parse JSON from either provider ──────────────────────────────────────
    const jsonText = rawText
      .replace(/^```json\s*/i, "").replace(/```$/m, "")
      .replace(/[\s\S]*?({[\s\S]*})[\s\S]*$/, "$1")  // extract first JSON object if wrapped in text
      .trim();

    const parsed = JSON.parse(jsonText);
    return NextResponse.json({ ...parsed, _provider: usedProvider });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/detect]", message);

    // Surface zero-quota errors clearly
    if (isZeroQuota(message)) {
      return NextResponse.json({
        error: "ZERO_QUOTA",
        detail: "Your Gemini API key has limit:0. Get a key from aistudio.google.com (not Cloud Console), or add a Together AI key from api.together.ai.",
      }, { status: 429 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

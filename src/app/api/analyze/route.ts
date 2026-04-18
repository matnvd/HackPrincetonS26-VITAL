import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `You are a hospital triage AI analyzing a camera feed. For each visible person output only JSON:
{"patients":[{"id":"P1","location":"brief location","posture":"standing|sitting|lying|slumped","movement":"active|slow|still|none","visible_distress":true|false,"triage":"CRITICAL|URGENT|STABLE|MONITORING","reason":"one sentence","confidence":0.0}]}
CRITICAL=life threat now, URGENT=needs care soon, STABLE=ok, MONITORING=observe.
No people visible: {"patients":[]}
Return JSON only. No preamble, no markdown fences.`;

export async function POST(req: Request) {
    try {
    const { imageBase64 } = await req.json();

    const model = genAI.getGenerativeModel({
        model: "gemini-3.1-flash-lite-preview",
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
    });

    const result = await model.generateContent([
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        { text: "Analyze this hospital camera frame and triage all visible people." },
    ]);

    const text = result.response.text().replace(/^```json\s*/i, "").replace(/```$/m, "").trim();
        return Response.json(JSON.parse(text));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[/api/analyze]", message);
        return Response.json({ error: message }, { status: 500 });
    }
}

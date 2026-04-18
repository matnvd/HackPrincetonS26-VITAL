import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const PROMPT = (frames: string) => `
You are a security analyst writing a triage report based on AI-classified video frames.

Here are the frame-by-frame classifications in order:
${frames}

Write a concise incident triage report. Respond with ONLY valid JSON, no markdown:
{
  "overview": "<2-3 sentence summary of what happened across the video>",
  "criticalMoment": "<timestamp and description of the single most critical moment, or null if none>",
  "action": "<one clear recommended action: e.g. 'No action needed', 'Review footage', 'Contact security', 'Call emergency services'>",
  "severity": "LOW" | "MEDIUM" | "HIGH"
}
`.trim();

export async function POST(req: NextRequest) {
  const { results, apiKey } = await req.json();

  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: "Missing results array" }, { status: 400 });
  }

  const framesSummary = results
    .map((r: { timestampSec: number; risk: string; description: string }) =>
      `[${String(Math.floor(r.timestampSec / 60)).padStart(2, "0")}:${String(Math.floor(r.timestampSec % 60)).padStart(2, "0")}] ${r.risk} — ${r.description}`
    )
    .join("\n");

  const client = apiKey ? new GoogleGenerativeAI(apiKey) : genAI;
  const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent(PROMPT(framesSummary));

  const text = result.response.text().trim();
  const jsonText = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  return NextResponse.json(JSON.parse(jsonText));
}

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const PROMPT = `You are a security and safety analyst reviewing a video frame.

Classify this image into exactly one risk level:
- GREEN: normal, calm, no concerning activity
- YELLOW: mildly concerning — something unusual, ambiguous, or worth watching
- RED: urgent — clear danger, violence, medical emergency, or serious incident

Respond with ONLY valid JSON in this exact shape, no markdown:
{
  "risk": "GREEN" | "YELLOW" | "RED",
  "description": "<one sentence: what you see in the frame>",
  "explanation": "<one sentence: why you assigned this risk level>"
}`;

export async function POST(req: NextRequest) {
  const { base64, apiKey } = await req.json();

  if (!base64 || typeof base64 !== "string") {
    return NextResponse.json({ error: "Missing base64 image" }, { status: 400 });
  }

  const imageData = base64.replace(/^data:image\/\w+;base64,/, "");

  const client = apiKey ? new GoogleGenerativeAI(apiKey) : genAI;
  const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

  const result = await model.generateContent([
    PROMPT,
    { inlineData: { mimeType: "image/jpeg", data: imageData } },
  ]);

  const text = result.response.text().trim();

  // Gemini occasionally wraps JSON in ```json ... ``` — strip it
  const jsonText = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  const parsed = JSON.parse(jsonText);

  return NextResponse.json(parsed);
}

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR  = path.join(process.cwd(), "data");
const KEYS_FILE = path.join(DATA_DIR, "keys.json");

function readKeys(): { geminiKey?: string; togetherKey?: string } {
  try {
    return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeKeys(keys: { geminiKey?: string; togetherKey?: string }) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), "utf8");
}

export async function GET() {
  const keys = readKeys();
  return NextResponse.json({
    geminiActive:  !!keys.geminiKey,
    togetherActive: !!keys.togetherKey,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const current = readKeys();

  if ("geminiKey" in body)  current.geminiKey  = body.geminiKey  || undefined;
  if ("togetherKey" in body) current.togetherKey = body.togetherKey || undefined;

  writeKeys(current);
  return NextResponse.json({ ok: true });
}

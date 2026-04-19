import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { insert } from "@/app/lib/storage";
import type { LiveSession } from "@/app/lib/types";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session: LiveSession = {
      id: randomUUID(),
      startedAt: new Date().toISOString(),
      status: "active",
    };
    await insert<LiveSession>("sessions", session);
    return NextResponse.json({ sessionId: session.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/tab3/sessions POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

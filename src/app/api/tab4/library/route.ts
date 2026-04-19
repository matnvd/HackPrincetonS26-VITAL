import { NextResponse } from "next/server";
import { readTable } from "@/app/lib/storage";
import type { AnalysisEvent, Severity, Upload } from "@/app/lib/types";
import type { LibraryRow } from "@/app/tab4/types";

export const runtime = "nodejs";

const ZERO_BUCKETS: Record<Severity, number> = {
  normal: 0,
  low: 0,
  moderate: 0,
  urgent: 0,
  critical: 0,
};

export async function GET() {
  try {
    const [uploads, events] = await Promise.all([
      readTable<Upload>("uploads"),
      readTable<AnalysisEvent>("events"),
    ]);

    const buckets = new Map<string, Record<Severity, number>>();
    for (const e of events) {
      if (!e.uploadId) continue;
      let b = buckets.get(e.uploadId);
      if (!b) {
        b = { ...ZERO_BUCKETS };
        buckets.set(e.uploadId, b);
      }
      if (e.severity in b) b[e.severity] += 1;
    }

    const rows: LibraryRow[] = uploads
      .map((u) => {
        const b = buckets.get(u.id) ?? { ...ZERO_BUCKETS };
        const totalEvents =
          b.normal + b.low + b.moderate + b.urgent + b.critical;
        return { ...u, totalEvents, bySeverity: b };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ uploads: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/tab4/library GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

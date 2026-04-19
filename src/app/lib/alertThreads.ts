import { readTable, writeTable } from "@/app/lib/storage";
import type { AnalysisEvent } from "@/app/lib/types";

export interface AlertThreadRow {
  id: string;
  spaceId: string;
  nursePhone: string;
  eventSnapshot: AnalysisEvent;
  repliesRemaining: number;
  updatedAt: string;
  /** After quota is exhausted, we send one closing notice when they message again. */
  notifiedClosed?: boolean;
}

export async function upsertAlertThread(row: AlertThreadRow): Promise<void> {
  const rows = await readTable<AlertThreadRow>("alertThreads");
  const idx = rows.findIndex((r) => r.id === row.id);
  if (idx === -1) rows.push(row);
  else rows[idx] = row;
  await writeTable("alertThreads", rows);
}

export async function findAlertThreadBySpaceId(
  spaceId: string,
): Promise<AlertThreadRow | undefined> {
  const rows = await readTable<AlertThreadRow>("alertThreads");
  return rows.find((r) => r.spaceId === spaceId);
}

export async function updateAlertThread(
  id: string,
  patch: Partial<AlertThreadRow>,
): Promise<AlertThreadRow | null> {
  const rows = await readTable<AlertThreadRow>("alertThreads");
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const next = { ...rows[idx], ...patch, updatedAt: new Date().toISOString() };
  rows[idx] = next;
  await writeTable("alertThreads", rows);
  return next;
}

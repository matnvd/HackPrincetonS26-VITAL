"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AnalysisViewer from "@/app/tab2/components/AnalysisViewer";
import type { LibraryRow } from "../types";
import UploadCard from "./UploadCard";

export default function LibraryView() {
  const [uploads, setUploads] = useState<LibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/tab4/library", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load library");
      setUploads(data.uploads ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/tab2/uploads/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Delete failed (${res.status})`);
        }
        setUploads((prev) => prev.filter((u) => u.id !== id));
        setSelectedId((prev) => (prev === id ? null : prev));
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return uploads;
    return uploads.filter((u) => u.filename.toLowerCase().includes(q));
  }, [uploads, searchQuery]);

  const selectedUpload = useMemo(
    () => uploads.find((u) => u.id === selectedId) ?? null,
    [uploads, selectedId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#09090f] text-slate-200 md:flex-row">
      <section className="flex w-full min-w-0 flex-col gap-3 border-b border-white/10 p-6 md:w-2/5 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-white">Library</h1>
            <p className="mt-1 text-xs text-slate-400">
              {uploads.length} upload{uploads.length === 1 ? "" : "s"} · auto-refreshes every 5s
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="text-[11px] text-slate-400 hover:text-slate-200"
          >
            Refresh
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search filenames…"
            className="w-full rounded-md border border-white/10 bg-[#0c0c12] px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-white/25 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-slate-500 hover:text-slate-300"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="-mr-2 flex min-h-0 flex-1 flex-col overflow-y-auto pr-2">
          {loading && uploads.length === 0 ? (
            <div className="text-xs text-slate-500">Loading…</div>
          ) : error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-md border border-white/10 bg-[#0c0c12] px-3 py-6 text-center text-xs text-slate-500">
              {uploads.length === 0
                ? "No uploads yet. Add one from the upload tab."
                : `No uploads match “${searchQuery}”.`}
            </div>
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
            >
              {filtered.map((u) => (
                <UploadCard
                  key={u.id}
                  upload={u}
                  selected={selectedId === u.id}
                  onSelect={setSelectedId}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col p-6">
        {selectedUpload ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-white">
                {selectedUpload.filename}
              </div>
              <div className="mt-1 font-mono text-[11px] text-slate-600">
                {selectedUpload.id}
              </div>
            </div>
            <AnalysisViewer
              key={selectedUpload.id}
              uploadId={selectedUpload.id}
              status={selectedUpload.status}
            />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            Select an upload to view analysis
          </div>
        )}
      </section>
    </div>
  );
}

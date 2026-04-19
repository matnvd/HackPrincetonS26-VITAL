"use client";

import { useEffect, useRef, useState } from "react";
import StatusBadge from "@/app/components/StatusBadge";
import type { LibraryRow } from "../types";

interface Props {
  upload: LibraryRow;
  selected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diffMs = Date.now() - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return diffSec <= 1 ? "just now" : `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.floor(day / 7)}w ago`;
  if (day < 365) return `${Math.floor(day / 30)}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

function PlaceholderArt() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white/5 text-slate-600">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" />
      </svg>
    </div>
  );
}

export default function UploadCard({ upload, selected, onSelect, onDelete }: Props) {
  const [imgError, setImgError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    };
  }, []);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      setConfirmDelete(false);
      onDelete(upload.id);
      return;
    }
    setConfirmDelete(true);
    confirmTimeoutRef.current = setTimeout(() => setConfirmDelete(false), 3000);
  };

  const sev = upload.bySeverity;
  const segs: { node: React.ReactNode; key: string }[] = [];
  if (sev.critical > 0) {
    segs.push({
      key: "c",
      node: (
        <span className="text-red-500">
          {sev.critical} critical
        </span>
      ),
    });
  }
  if (sev.urgent > 0) {
    segs.push({
      key: "u",
      node: (
        <span className="text-orange-500">
          {sev.urgent} urgent
        </span>
      ),
    });
  }
  if (upload.totalEvents > 0) {
    segs.push({
      key: "t",
      node: (
        <span className="text-slate-400">
          {segs.length === 0
            ? `${upload.totalEvents} event${upload.totalEvents === 1 ? "" : "s"}`
            : `${upload.totalEvents} total`}
        </span>
      ),
    });
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(upload.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(upload.id);
        }
      }}
      className={`group relative flex cursor-pointer flex-col gap-2 rounded-lg border bg-[#0c0c12] p-3 transition-colors hover:border-white/30 ${
        selected ? "border-white/30 ring-2 ring-white/40" : "border-white/10"
      }`}
    >
      <button
        type="button"
        onClick={handleDeleteClick}
        aria-label={confirmDelete ? "Confirm delete" : "Delete upload"}
        className={`absolute right-2 top-2 z-10 inline-flex h-7 items-center justify-center gap-1 rounded-md border px-2 text-[10px] font-medium uppercase tracking-wider transition-colors ${
          confirmDelete
            ? "border-red-500/50 bg-red-500/20 text-red-200 hover:bg-red-500/30"
            : "border-white/10 bg-black/40 text-slate-400 opacity-0 hover:border-red-500/40 hover:text-red-300 group-hover:opacity-100"
        }`}
      >
        {confirmDelete ? (
          "Confirm?"
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13M10 11v7M14 11v7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
        {imgError ? (
          <PlaceholderArt />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/tab2/uploads/${upload.id}/thumbnail`}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        )}
        <div className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-100">
          {formatDuration(upload.durationSeconds)}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-ellipsis text-sm font-medium text-white">
          {upload.filename}
        </div>
        <StatusBadge status={upload.status} />
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-500">{formatRelative(upload.createdAt)}</span>
        {segs.length > 0 ? (
          <span className="flex items-center gap-1">
            {segs.map((s, i) => (
              <span key={s.key} className="flex items-center gap-1">
                {i > 0 && <span className="text-slate-600">·</span>}
                {s.node}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </div>
    </div>
  );
}

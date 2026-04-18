"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "gemini_api_key";

export function getStoredApiKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem(STORAGE_KEY) ?? undefined;
}

export default function ApiKeySettings() {
  const [open, setOpen]     = useState(false);
  const [value, setValue]   = useState("");
  const [active, setActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef            = useRef<HTMLInputElement>(null);
  const panelRef            = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) { setValue(stored); setActive(true); }
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    localStorage.setItem(STORAGE_KEY, trimmed);
    setActive(true);
    setOpen(false);
  };

  const handleClear = () => {
    localStorage.removeItem(STORAGE_KEY);
    setValue("");
    setActive(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") setOpen(false);
  };

  const handleOpen = () => {
    setOpen((v) => !v);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const maskedKey = active && value
    ? value.slice(0, 6) + "••••••••••••" + value.slice(-4)
    : null;

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button */}
      <button
        onClick={handleOpen}
        title="Change Gemini API Key"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
          active
            ? "border-green-500/50 bg-green-500/10 text-green-400 hover:bg-green-500/20"
            : "border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
        {active ? "Key Active" : "Set API Key"}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-gray-800">
            <p className="text-gray-200 text-sm font-semibold">Gemini API Key</p>
            <p className="text-gray-500 text-xs mt-0.5">Override the default key stored in .env.local</p>
          </div>

          <div className="p-4 flex flex-col gap-3">
            {active && maskedKey && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30">
                <span className="text-green-400 text-xs font-mono">{maskedKey}</span>
                <span className="text-green-500 text-xs">active</span>
              </div>
            )}

            <input
              ref={inputRef}
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="AIzaSy…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-gray-500 placeholder-gray-600"
            />

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={!value.trim()}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  value.trim()
                    ? "bg-red-600 hover:bg-red-500 text-white"
                    : "bg-gray-800 text-gray-600 cursor-not-allowed"
                }`}
              >
                Save Key
              </button>
              {active && (
                <button
                  onClick={handleClear}
                  className="px-3 py-2 rounded-lg border border-gray-700 text-gray-500 hover:text-gray-300 text-xs transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            <p className="text-gray-700 text-xs leading-snug">
              Stored in browser localStorage. Sent with each request — never logged server-side.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

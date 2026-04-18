"use client";

import { useEffect, useRef, useState } from "react";

const GEMINI_KEY  = "gemini_api_key";
const TOGETHER_KEY = "together_api_key";

export function getStoredApiKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem(GEMINI_KEY) ?? undefined;
}

export function getStoredTogetherKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem(TOGETHER_KEY) ?? undefined;
}

function KeyInput({
  label, sublabel, placeholder, storageKey, linkText, linkHref,
}: {
  label: string; sublabel: string; placeholder: string;
  storageKey: string; linkText: string; linkHref: string;
}) {
  const [value, setValue]   = useState("");
  const [active, setActive] = useState(false);
  const inputRef            = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) { setValue(stored); setActive(true); }
  }, [storageKey]);

  const save = () => {
    const t = value.trim();
    if (!t) return;
    localStorage.setItem(storageKey, t);
    setActive(true);
  };

  const clear = () => {
    localStorage.removeItem(storageKey);
    setValue("");
    setActive(false);
  };

  const masked = active && value
    ? value.slice(0, 6) + "••••••••••" + value.slice(-4)
    : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-200 text-xs font-semibold">{label}</p>
          <p className="text-gray-600 text-xs">{sublabel}</p>
        </div>
        {active && (
          <span className="text-green-400 text-xs font-mono bg-green-500/10 border border-green-500/30 px-1.5 py-0.5 rounded">
            active
          </span>
        )}
      </div>

      {masked && (
        <div className="px-2.5 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-mono">
          {masked}
        </div>
      )}

      <input
        ref={inputRef}
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 font-mono focus:outline-none focus:border-gray-500 placeholder-gray-600"
      />

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={!value.trim()}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            value.trim() ? "bg-red-600 hover:bg-red-500 text-white" : "bg-gray-800 text-gray-600 cursor-not-allowed"
          }`}
        >
          Save
        </button>
        {active && (
          <button onClick={clear} className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-500 hover:text-gray-300 text-xs cursor-pointer">
            Clear
          </button>
        )}
      </div>

      <a
        href={linkHref} target="_blank" rel="noreferrer"
        className="text-blue-500 hover:text-blue-400 text-xs underline"
      >
        {linkText} ↗
      </a>
    </div>
  );
}

export default function ApiKeySettings() {
  const [open, setOpen] = useState(false);
  const panelRef        = useRef<HTMLDivElement>(null);

  const [geminiActive,  setGeminiActive]  = useState(false);
  const [togetherActive, setTogetherActive] = useState(false);

  useEffect(() => {
    setGeminiActive(!!localStorage.getItem(GEMINI_KEY));
    setTogetherActive(!!localStorage.getItem(TOGETHER_KEY));
  }, [open]); // refresh status when panel opens/closes

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const hasAny = geminiActive || togetherActive;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
          hasAny
            ? "border-green-500/50 bg-green-500/10 text-green-400 hover:bg-green-500/20"
            : "border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
        {geminiActive ? "Gemini ✓" : togetherActive ? "Together ✓" : "API Keys"}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 pt-3 pb-2 border-b border-gray-800">
            <p className="text-gray-200 text-sm font-bold">AI Provider Keys</p>
            <p className="text-gray-600 text-xs mt-0.5">
              Gemini is primary. Together AI is the fallback when Gemini quota is 0.
            </p>
          </div>

          <div className="p-4 flex flex-col gap-5">

            {/* Gemini */}
            <KeyInput
              label="Google Gemini"
              sublabel="Primary — get from AI Studio (not Cloud Console)"
              placeholder="AIzaSy…"
              storageKey={GEMINI_KEY}
              linkText="Get free key at aistudio.google.com"
              linkHref="https://aistudio.google.com/apikey"
            />

            <div className="border-t border-gray-800" />

            {/* Together AI */}
            <KeyInput
              label="Together AI  (fallback)"
              sublabel="Used automatically when Gemini has limit:0"
              placeholder="your-together-api-key"
              storageKey={TOGETHER_KEY}
              linkText="Get free $25 credits at api.together.ai"
              linkHref="https://api.together.ai"
            />

            <p className="text-gray-700 text-xs leading-snug border-t border-gray-800 pt-3">
              Keys stored in browser localStorage, sent with each request. Never logged.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

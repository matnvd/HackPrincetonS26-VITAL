"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { extractFrames } from "@/lib/extractFrames";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleFile = (f: File) => {
    if (f.type.startsWith("video/")) setFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const handleAnalyze = async () => {
    if (!file) return;
    setExtracting(true);
    setProgress("Extracting frames…");
    try {
      const frames = await extractFrames(file);
      setProgress(`${frames.length} frames extracted`);
      sessionStorage.setItem("wait_frames", JSON.stringify(frames));
      router.push(`/results?name=${encodeURIComponent(file.name)}`);
    } catch (err) {
      console.error(err);
      setProgress("Failed to extract frames. Try a different video.");
      setExtracting(false);
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4">
      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white">
          W<span className="text-red-500">.</span>A<span className="text-red-500">.</span>I<span className="text-red-500">.</span>T<span className="text-red-500">.</span>
        </h1>
        <p className="mt-2 text-gray-400 text-sm">Watchful AI Incident Triage</p>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`
          w-full max-w-lg cursor-pointer rounded-2xl border-2 border-dashed p-12
          flex flex-col items-center gap-4 transition-colors
          ${dragging
            ? "border-red-500 bg-red-500/10"
            : file
            ? "border-green-500 bg-green-500/5"
            : "border-gray-700 bg-gray-900 hover:border-gray-500"
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {file ? (
          <>
            <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-green-400 font-medium">{file.name}</p>
            <p className="text-gray-500 text-sm">{(file.size / 1024 / 1024).toFixed(1)} MB · Click to change</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.67v6.66a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-gray-300 font-medium">Drop a video here</p>
              <p className="text-gray-500 text-sm mt-1">or click to browse</p>
            </div>
            <p className="text-gray-600 text-xs">MP4, MOV, AVI supported</p>
          </>
        )}
      </div>

      {/* Analyze button */}
      <button
        onClick={handleAnalyze}
        disabled={!file || extracting}
        className={`
          mt-6 px-10 py-3 rounded-xl font-semibold text-sm tracking-wide transition-all
          ${file && !extracting
            ? "bg-red-600 hover:bg-red-500 text-white cursor-pointer"
            : "bg-gray-800 text-gray-600 cursor-not-allowed"
          }
        `}
      >
        {extracting ? "Extracting…" : "Analyze"}
      </button>

      <p className="mt-3 text-xs h-4 text-gray-500">
        {progress || "Frames are extracted every ~3 seconds and classified by AI"}
      </p>
    </main>
  );
}

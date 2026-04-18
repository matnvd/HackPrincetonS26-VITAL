"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractFrames } from "@/lib/extractFrames";
import type { DetectedPerson } from "@/lib/patientStore";
import FaceOverlay from "@/components/FaceOverlay";

interface Props {
  onFrameAnalyzed: (people: DetectedPerson[], frameBase64: string) => void;
  onAnalysisStart: () => void;
}

async function detectPeople(base64: string): Promise<DetectedPerson[]> {
  const res = await fetch("/api/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Detect API error ${res.status}`);
  return data.people ?? [];
}

// ─── Upload Mode ─────────────────────────────────────────────────────────────

function UploadMode({ onFrameAnalyzed, onAnalysisStart }: Props) {
  const [file, setFile]           = useState<File | null>(null);
  const [dragging, setDragging]   = useState(false);
  const [phase, setPhase]         = useState<"idle" | "extracting" | "analyzing" | "done">("idle");
  const [progress, setProgress]   = useState({ current: 0, total: 0 });
  const inputRef                  = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => { if (f.type.startsWith("video/")) setFile(f); };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleAnalyze = async () => {
    if (!file) return;
    onAnalysisStart();
    setPhase("extracting");

    const frames = await extractFrames(file);
    setPhase("analyzing");
    setProgress({ current: 0, total: frames.length });

    for (let i = 0; i < frames.length; i++) {
      setProgress({ current: i + 1, total: frames.length });
      try {
        const people = await detectPeople(frames[i].base64);
        onFrameAnalyzed(people, frames[i].base64);
      } catch (err) {
        console.error(`Frame ${i + 1} detection failed:`, err);
      }
      if (i < frames.length - 1) await new Promise((r) => setTimeout(r, 500));
    }

    setPhase("done");
  };

  const busy = phase === "extracting" || phase === "analyzing";

  return (
    <div className="flex flex-col gap-6">
      {/* Drop zone */}
      <div
        onClick={() => !busy && inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className={`
          rounded-2xl border-2 border-dashed p-10 flex flex-col items-center gap-3 transition-colors
          ${busy ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
          ${dragging ? "border-red-500 bg-red-500/10"
            : file ? "border-green-500 bg-green-500/5"
            : "border-gray-700 bg-gray-900 hover:border-gray-500"}
        `}
      >
        <input ref={inputRef} type="file" accept="video/*" className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

        {file ? (
          <>
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-green-400 font-medium text-sm">{file.name}</p>
            <p className="text-gray-500 text-xs">{(file.size / 1024 / 1024).toFixed(1)} MB · Click to change</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.67v6.66a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <p className="text-gray-300 font-medium text-sm">Drop a video here</p>
            <p className="text-gray-500 text-xs">MP4, MOV, AVI · or click to browse</p>
          </>
        )}
      </div>

      {/* Progress */}
      {busy && (
        <div>
          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden mb-2">
            <div
              className="h-full bg-red-500 transition-all duration-500"
              style={{ width: phase === "extracting" ? "10%" : `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <p className="text-gray-500 text-xs">
            {phase === "extracting"
              ? "Extracting frames…"
              : `Analyzing frame ${progress.current} of ${progress.total}…`}
          </p>
        </div>
      )}

      {phase === "done" && (
        <p className="text-green-400 text-xs">
          Analysis complete — check the Dashboard tab for detected patients.
        </p>
      )}

      {/* Analyze button */}
      <button
        onClick={handleAnalyze}
        disabled={!file || busy}
        className={`py-3 rounded-xl font-semibold text-sm transition-all ${
          file && !busy
            ? "bg-red-600 hover:bg-red-500 text-white cursor-pointer"
            : "bg-gray-800 text-gray-600 cursor-not-allowed"
        }`}
      >
        {busy ? (phase === "extracting" ? "Extracting…" : "Analyzing…") : "Analyze Video"}
      </button>
    </div>
  );
}

// ─── Live Camera Mode ─────────────────────────────────────────────────────────

function LiveMode({ onFrameAnalyzed, onAnalysisStart }: Props) {
  const videoRef        = useRef<HTMLVideoElement>(null);
  const streamRef       = useRef<MediaStream | null>(null);
  const isCapturingRef  = useRef(false); // ref so the async loop always reads current value

  const [camState, setCamState]         = useState<"idle" | "active" | "analyzing" | "error">("idle");
  const [isCapturing, setIsCapturing]   = useState(false);
  const [frameCount, setFrameCount]     = useState(0);
  const [lastDetectTime, setLastDetect] = useState<number | null>(null);
  const [errorMsg, setErrorMsg]         = useState("");
  const [lastError, setLastError]       = useState("");

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamState("active");
    } catch {
      setErrorMsg("Camera access denied or not available.");
      setCamState("error");
    }
  };

  const stopCamera = () => {
    stopCapture();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamState("idle");
    setIsCapturing(false);
  };

  const captureFrame = (): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const canvas = document.createElement("canvas");
    // 640px balances detection quality vs. payload size — smaller = faster Gemini round-trip
    const scale = Math.min(1, 640 / video.videoWidth);
    canvas.width  = Math.round(video.videoWidth  * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  };

  const startCapture = () => {
    isCapturingRef.current = true;
    setIsCapturing(true);
    setCamState("analyzing");
    setLastError("");
    onAnalysisStart();

    // Continuous loop: capture → send → wait 800ms → repeat.
    // No skipped frames — each call starts immediately after the previous response.
    const loop = async () => {
      while (isCapturingRef.current) {
        setLastError("");
        try {
          const base64 = captureFrame();
          if (!base64) throw new Error("Camera not ready — retrying…");
          const people = await detectPeople(base64);
          onFrameAnalyzed(people, base64);
          setFrameCount((n) => n + 1);
          setLastDetect(Date.now());
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error("Live detection error:", msg);
          setLastError(msg);
        }
        // Minimal pause — just enough to yield the thread, not add latency
        await new Promise((r) => setTimeout(r, 100));
      }
    };

    loop();
  };

  const stopCapture = () => {
    isCapturingRef.current = false;
    setIsCapturing(false);
    if (camState === "analyzing") setCamState("active");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isCapturingRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Camera preview */}
      <div className="relative rounded-xl overflow-hidden bg-gray-900 border border-gray-800 aspect-video flex items-center justify-center">
        <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
        <FaceOverlay videoRef={videoRef} active={camState === "active" || camState === "analyzing"} />

        {camState === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.67v6.66a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm">Camera not started</p>
          </div>
        )}

        {camState === "error" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-red-400 text-sm">{errorMsg}</p>
          </div>
        )}

        {/* Live indicator */}
        {(camState === "active" || camState === "analyzing") && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 text-xs font-semibold text-white">
            <span className={`w-1.5 h-1.5 rounded-full ${camState === "analyzing" ? "bg-red-400 animate-pulse" : "bg-gray-400"}`} />
            {camState === "analyzing" ? `LIVE · ${frameCount} frames` : "PREVIEW"}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        {camState === "idle" || camState === "error" ? (
          <button
            onClick={startCamera}
            className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-semibold transition-colors cursor-pointer"
          >
            Start Camera
          </button>
        ) : (
          <>
            <button
              onClick={isCapturing ? stopCapture : startCapture}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                isCapturing
                  ? "bg-gray-800 hover:bg-gray-700 text-gray-200"
                  : "bg-red-600 hover:bg-red-500 text-white"
              }`}
            >
              {isCapturing ? "Pause Analysis" : "Start Analysis"}
            </button>
            <button
              onClick={stopCamera}
              className="px-4 py-2.5 rounded-xl border border-gray-700 text-gray-500 hover:text-gray-300 text-sm transition-colors cursor-pointer"
            >
              Stop Camera
            </button>
          </>
        )}
      </div>

      {camState === "analyzing" && (
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>{frameCount} frame{frameCount !== 1 ? "s" : ""} analyzed · results on Dashboard tab</span>
          {lastDetectTime && (
            <span className="font-mono">last scan {Math.round((Date.now() - lastDetectTime) / 1000)}s ago</span>
          )}
        </div>
      )}

      {lastError && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          {lastError}
        </div>
      )}
    </div>
  );
}

// ─── VideoTab shell ───────────────────────────────────────────────────────────

export default function VideoTab({ onFrameAnalyzed, onAnalysisStart }: Props) {
  const [mode, setMode] = useState<"upload" | "live">("upload");

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex gap-1 p-1 bg-gray-900 rounded-xl border border-gray-800 mb-6">
        {(["upload", "live"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              mode === m ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {m === "upload" ? "Upload Video" : "Live Camera"}
          </button>
        ))}
      </div>

      {mode === "upload"
        ? <UploadMode onFrameAnalyzed={onFrameAnalyzed} onAnalysisStart={onAnalysisStart} />
        : <LiveMode   onFrameAnalyzed={onFrameAnalyzed} onAnalysisStart={onAnalysisStart} />
      }
    </div>
  );
}

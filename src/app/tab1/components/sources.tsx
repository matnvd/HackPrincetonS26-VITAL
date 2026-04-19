"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Patient } from "@/app/tab1/types";
import Dashboard from "./Dashboard";

const SAMPLE_INTERVAL_MS = 4000; // increase during demo
const TRIAGE_ORDER: Record<string, number> = { CRITICAL: 0, URGENT: 1, STABLE: 2, MONITORING: 3 };

function wordSimilarity(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\s+/));
  const wb = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...wa].filter((w) => wb.has(w)).length;
  return intersection / Math.max(wa.size, wb.size, 1);
}

function findSimilarKey(map: Record<string, Patient>, incoming: string, camLabel: string): string | null {
  let bestKey: string | null = null;
  let bestScore = 0.45;
  for (const [key, existing] of Object.entries(map)) {
    if (existing.cameraLabel !== camLabel) continue;
    const score = wordSimilarity(incoming, existing.id);
    if (score > bestScore) { bestScore = score; bestKey = key; }
  }
  return bestKey;
}

interface Event {
  time: string;
  msg: string;
  level: string;
}

interface CameraDevice { deviceId: string; label: string; }

interface ActiveCamera {
  deviceId: string;
  label: string;
  stream: MediaStream;
  analyzing: boolean;
  prevFrameData: string | null;
  intervalId: ReturnType<typeof setInterval> | null;
}

interface Props { onPatientsChange?: (patients: Patient[]) => void; }

export default function HospitalTriageAI({ onPatientsChange }: Props = {}) {
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const activeCamerasRef = useRef<Record<string, ActiveCamera>>({});

  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [activeCameras, setActiveCameras] = useState<Record<string, ActiveCamera>>({});
  const [patients, setPatients] = useState<Patient[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => { onPatientsChange?.(patients); }, [patients, onPatientsChange]);

  const [videoFiles, setVideoFiles] = useState<string[]>([]);
  const [simulating, setSimulating] = useState<string | null>(null);
  const [simAnalyzing, setSimAnalyzing] = useState(false);
  const simIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simVideoRef = useRef<HTMLVideoElement | null>(null);
  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const simAnalyzingRef = useRef(false);
  const simEndedHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => { activeCamerasRef.current = activeCameras; }, [activeCameras]);

  const addEvent = useCallback((msg: string, level = "info") => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    setEvents((prev) => [{ time, msg, level }, ...prev].slice(0, 30));
  }, []);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((all) => {
      const cams = all
        .filter((d) => d.kind === "videoinput")
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
      setDevices(cams);
    });
  }, []);

  useEffect(() => {
    fetch("/api/tab1/videos").then((r) => r.json()).then((d) => setVideoFiles(d.videos ?? []));
  }, []);

  const captureFrame = useCallback((deviceId: string): string | null => {
    const video = videoRefs.current[deviceId];
    const canvas = canvasRefs.current[deviceId];
    if (!video || !canvas || video.readyState < 2) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    canvas.width = 320;
    canvas.height = 180;
    ctx.drawImage(video, 0, 0, 320, 180);
    return canvas.toDataURL("image/jpeg", 0.65);
  }, []);

  const hasMotion = useCallback((deviceId: string, frameData: string): boolean => {
    const prev = activeCamerasRef.current[deviceId]?.prevFrameData;
    if (!prev) {
      setActiveCameras((s) => s[deviceId] ? { ...s, [deviceId]: { ...s[deviceId], prevFrameData: frameData } } : s);
      return true;
    }
    const diff = Math.abs(frameData.length - prev.length);
    const ratio = diff / frameData.length;
    setActiveCameras((s) => s[deviceId] ? { ...s, [deviceId]: { ...s[deviceId], prevFrameData: frameData } } : s);
    return ratio > 0.004;
  }, []);

  const analyzeFrame = useCallback(async (deviceId: string, cameraLabel: string, frameData: string) => {
    if (deviceId === "sim") {
      setSimAnalyzing(true);
      simAnalyzingRef.current = true;
    } else {
      setActiveCameras((s) => s[deviceId] ? { ...s, [deviceId]: { ...s[deviceId], analyzing: true } } : s);
    }
    try {
      const base64 = frameData.split(",")[1];
      const res = await fetch("/api/tab1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });

      const parsed = await res.json();
      if (!res.ok) throw new Error(parsed.error || "Analysis failed");
      const now = new Date().toLocaleTimeString("en-US", { hour12: false });

      if (parsed.patients?.length > 0) {
        setPatients((prev) => {
          const map: Record<string, Patient> = Object.fromEntries(prev.map((p) => [`${p.cameraLabel}:${p.id}`, p]));
          for (const p of parsed.patients as Patient[]) {
            const exactKey = `${cameraLabel}:${p.id}`;
            const key = map[exactKey] ? exactKey : (findSimilarKey(map, p.id, cameraLabel) ?? exactKey);
            map[key] = { ...p, cameraLabel, firstSeen: map[key]?.firstSeen || now, lastSeen: now };
          }
          return Object.values(map).sort(
            (a, b) => (TRIAGE_ORDER[a.triage] ?? 9) - (TRIAGE_ORDER[b.triage] ?? 9)
          );
        });
        const critical = (parsed.patients as Patient[]).filter((p) => p.triage === "CRITICAL");
        if (critical.length > 0)
          addEvent(`[${cameraLabel}] ALERT: ${critical.length} critical patient(s) detected`, "critical");
        else
          addEvent(`[${cameraLabel}] ${parsed.patients.length} patient(s) detected`, "info");
      } else {
        addEvent(`[${cameraLabel}] No patients detected in frame`, "muted");
      }

    } catch (err) {
      addEvent(`[${cameraLabel}] Analysis error: ` + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      if (deviceId === "sim") {
        setSimAnalyzing(false);
        simAnalyzingRef.current = false;
      } else {
        setActiveCameras((s) => s[deviceId] ? { ...s, [deviceId]: { ...s[deviceId], analyzing: false } } : s);
      }
    }
  }, [addEvent]);

  const startSimulation = useCallback((filename: string) => {
    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    const video = simVideoRef.current;
    if (!video) return;

    if (simEndedHandlerRef.current) video.removeEventListener("ended", simEndedHandlerRef.current);

    video.src = `/video_samples/${filename}`;
    video.currentTime = 0;
    video.play();
    setSimulating(filename);
    addEvent(`Simulating: ${filename}`, "info");

    simIntervalRef.current = setInterval(() => {
      if (simAnalyzingRef.current) return;
      const canvas = simCanvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.ended) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = 320;
      canvas.height = 180;
      ctx.drawImage(video, 0, 0, 320, 180);
      const frameData = canvas.toDataURL("image/jpeg", 0.65);
      analyzeFrame("sim", filename, frameData);
    }, SAMPLE_INTERVAL_MS);

    const handleEnded = () => {
      if (simIntervalRef.current) { clearInterval(simIntervalRef.current); simIntervalRef.current = null; }
      video.currentTime = 0;
      video.play();
      addEvent(`[${filename}] Playback looping — analysis complete`, "muted");
    };
    simEndedHandlerRef.current = handleEnded;
    video.addEventListener("ended", handleEnded);
  }, [addEvent, analyzeFrame]);

  const stopSimulation = useCallback(() => {
    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    const video = simVideoRef.current;
    if (video) {
      if (simEndedHandlerRef.current) video.removeEventListener("ended", simEndedHandlerRef.current);
      video.pause();
      video.src = "";
    }
    simEndedHandlerRef.current = null;
    setSimulating(null);
    addEvent("Simulation stopped", "muted");
  }, [addEvent]);

  const startCamera = useCallback(async (device: CameraDevice) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: device.deviceId }, width: 640, height: 480 },
      });

      const intervalId = setInterval(() => {
        const frame = captureFrame(device.deviceId);
        if (!frame) return;
        if (hasMotion(device.deviceId, frame)) {
          const label = activeCamerasRef.current[device.deviceId]?.label ?? device.label;
          analyzeFrame(device.deviceId, label, frame);
        }
      }, SAMPLE_INTERVAL_MS);

      const cam: ActiveCamera = { deviceId: device.deviceId, label: device.label, stream, analyzing: false, prevFrameData: null, intervalId };
      setActiveCameras((prev) => ({ ...prev, [device.deviceId]: cam }));

      addEvent(`${device.label} started`, "info");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addEvent(`${device.label}: ` + (msg.includes("denied") ? "Camera access denied." : msg), "error");
    }
  }, [captureFrame, hasMotion, analyzeFrame, addEvent]);

  const stopCamera = useCallback((deviceId: string) => {
    const cam = activeCamerasRef.current[deviceId];
    if (!cam) return;
    cam.stream.getTracks().forEach((t) => t.stop());
    if (cam.intervalId) clearInterval(cam.intervalId);
    addEvent(`${cam.label} stopped`, "muted");
    setActiveCameras((prev) => { const next = { ...prev }; delete next[deviceId]; return next; });
  }, [addEvent]);

  useEffect(() => () => {
    Object.values(activeCamerasRef.current).forEach((cam) => {
      cam.stream.getTracks().forEach((t) => t.stop());
      if (cam.intervalId) clearInterval(cam.intervalId);
    });
  }, []);

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const handleDismiss = useCallback((key: string) => {
    setDismissed((prev) => new Set([...prev, key]));
  }, []);
  const visible = patients.filter((p) => !dismissed.has(`${p.cameraLabel}:${p.id}`));

  return (
    <div style={{ fontFamily: "var(--font-sans)", minHeight: "calc(100vh - 52px)", background: "#09090f", color: "white" }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        .live-dot { animation: blink 1.2s ease infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 440px", minHeight: "calc(100vh - 52px)" }}>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", borderRight: "1px solid rgba(255,255,255,0.08)" }}>

          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px" }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "10px" }}>Available cameras</div>
            {devices.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>No cameras found. Allow camera access and refresh.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {devices.map((d) => {
                  const active = !!activeCameras[d.deviceId];
                  return (
                    <button key={d.deviceId} onClick={() => active ? stopCamera(d.deviceId) : startCamera(d)}
                      style={{ padding: "6px 14px", borderRadius: "var(--border-radius-md)", border: active ? "0.5px solid var(--color-border-danger)" : "0.5px solid var(--color-border-secondary)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, background: active ? "var(--color-background-danger)" : "var(--color-background-secondary)", color: active ? "var(--color-text-danger)" : "var(--color-text-primary)" }}>
                      {active ? "Stop" : "Start"} · {d.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {videoFiles.length > 0 && (
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px" }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "10px" }}>Simulate from video file</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {videoFiles.map((f) => {
                  const active = simulating === f;
                  return (
                    <button key={f} onClick={() => active ? stopSimulation() : startSimulation(f)}
                      style={{ padding: "6px 14px", borderRadius: "var(--border-radius-md)", border: active ? "0.5px solid var(--color-border-danger)" : "0.5px solid var(--color-border-secondary)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, background: active ? "var(--color-background-danger)" : "var(--color-background-secondary)", color: active ? "var(--color-text-danger)" : "var(--color-text-primary)" }}>
                      {active ? "Stop" : "▶"} · {f}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: Object.values(activeCameras).length >= 1 ? "1fr 1fr" : "1fr", gap: "12px" }}>
            {Object.values(activeCameras).map((cam) => (
              <div key={cam.deviceId} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", position: "relative", aspectRatio: "16/9" }}>
                <video ref={(el) => { videoRefs.current[cam.deviceId] = el; if (el && el.srcObject !== cam.stream) { el.srcObject = cam.stream; el.play(); } }} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline autoPlay />
                <canvas ref={(el) => { canvasRefs.current[cam.deviceId] = el; }} style={{ display: "none" }} />
                <div style={{ position: "absolute", top: 8, left: 8, display: "flex", alignItems: "center", gap: "6px", background: "var(--color-background-danger)", padding: "3px 8px", borderRadius: "var(--border-radius-md)" }}>
                  <div className="live-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-text-danger)" }} />
                  <span style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-danger)" }}>{cam.label}</span>
                </div>
                {cam.analyzing && (
                  <div style={{ position: "absolute", top: 8, right: 8, display: "flex", alignItems: "center", gap: "5px", background: "var(--color-background-info)", padding: "3px 8px", borderRadius: "var(--border-radius-md)" }}>
                    <svg className="spin" width="9" height="9" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" stroke="var(--color-text-info)" strokeWidth="1.5" strokeDasharray="6 8" fill="none"/></svg>
                    <span style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-info)" }}>Analyzing</span>
                  </div>
                )}
              </div>
            ))}

            <div style={{ display: simulating ? "block" : (Object.values(activeCameras).length === 0 ? "block" : "none"), background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", position: "relative", aspectRatio: "16/9" }}>
              <video ref={simVideoRef} style={{ width: "100%", height: "100%", objectFit: "cover", display: simulating ? "block" : "none" }} muted playsInline />
              <canvas ref={simCanvasRef} style={{ display: "none" }} />
              {simulating ? (
                <>
                  <div style={{ position: "absolute", top: 8, left: 8, display: "flex", alignItems: "center", gap: "6px", background: "var(--color-background-warning)", padding: "3px 8px", borderRadius: "var(--border-radius-md)" }}>
                    <div className="live-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-text-warning)" }} />
                    <span style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-warning)" }}>SIM · {simulating}</span>
                  </div>
                  {simAnalyzing && (
                    <div style={{ position: "absolute", top: 8, right: 8, display: "flex", alignItems: "center", gap: "5px", background: "var(--color-background-info)", padding: "3px 8px", borderRadius: "var(--border-radius-md)" }}>
                      <svg className="spin" width="9" height="9" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" stroke="var(--color-text-info)" strokeWidth="1.5" strokeDasharray="6 8" fill="none"/></svg>
                      <span style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-info)" }}>Analyzing</span>
                    </div>
                  )}
                </>
              ) : Object.values(activeCameras).length === 0 ? (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none"><rect x="2" y="8" width="28" height="24" rx="3" stroke="var(--color-border-secondary)" strokeWidth="1.5"/><path d="M30 15l8-5v20l-8-5V15z" stroke="var(--color-border-secondary)" strokeWidth="1.5"/><circle cx="16" cy="20" r="5" stroke="var(--color-border-secondary)" strokeWidth="1.5"/></svg>
                  <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>No active cameras</span>
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ background: "#0f1015", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "14px", flex: 1 }}>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 10, fontWeight: 500 }}>Event log</div>
            {events.length === 0 ? (
              <div style={{ fontSize: 13, color: "#1e293b" }}>No events yet.</div>
            ) : (
              events.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 6, fontSize: 12, borderBottom: i < events.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", paddingBottom: 6 }}>
                  <span style={{ color: "#1e293b", whiteSpace: "nowrap", fontFamily: "monospace" }}>{e.time}</span>
                  <span style={{ color: e.level === "critical" ? "#fca5a5" : e.level === "error" ? "#f87171" : e.level === "muted" ? "#1e293b" : "#475569" }}>{e.msg}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ padding: "20px", overflowY: "auto", background: "#07070e" }}>
          <Dashboard patients={visible} onDismiss={handleDismiss} />
        </div>
      </div>
    </div>
  );
}

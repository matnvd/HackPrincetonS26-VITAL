"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const SAMPLE_INTERVAL_MS = 4000; // increase during demo
const TRIAGE_ORDER: Record<string, number> = { CRITICAL: 0, URGENT: 1, STABLE: 2, MONITORING: 3 };

type TriageLevel = "CRITICAL" | "URGENT" | "STABLE" | "MONITORING";

interface TriageCfg {
  bg: string;
  text: string;
  border: string;
  dot: string;
  label: string;
}

const TRIAGE_CONFIG: Record<TriageLevel, TriageCfg> = {
  CRITICAL: {
    bg: "var(--color-background-danger)",
    text: "var(--color-text-danger)",
    border: "var(--color-border-danger)",
    dot: "#E24B4A",
    label: "Immediate threat to life",
  },
  URGENT: {
    bg: "var(--color-background-warning)",
    text: "var(--color-text-warning)",
    border: "var(--color-border-warning)",
    dot: "#BA7517",
    label: "Needs care soon",
  },
  STABLE: {
    bg: "var(--color-background-success)",
    text: "var(--color-text-success)",
    border: "var(--color-border-success)",
    dot: "#3B6D11",
    label: "No immediate intervention",
  },
  MONITORING: {
    bg: "var(--color-background-info)",
    text: "var(--color-text-info)",
    border: "var(--color-border-info)",
    dot: "#185FA5",
    label: "Observe and reassess",
  },
};

interface Patient {
  id: string;
  location: string;
  posture: string;
  movement: string;
  visible_distress: boolean;
  triage: TriageLevel;
  reason: string;
  confidence: number;
  firstSeen: string;
  lastSeen: string;
  cameraLabel: string;
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

export default function HospitalTriageAI() {
  // per-camera video/canvas elements stored by deviceId
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const activeCamerasRef = useRef<Record<string, ActiveCamera>>({});

  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [activeCameras, setActiveCameras] = useState<Record<string, ActiveCamera>>({});
  const [patients, setPatients] = useState<Patient[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [stats, setStats] = useState<{ analyzed: number; skipped: number; lastAt: string | null }>({ analyzed: 0, skipped: 0, lastAt: null });

  // simulate mode — video files from public/video_samples/
  const [videoFiles, setVideoFiles] = useState<string[]>([]);
  const [simulating, setSimulating] = useState<string | null>(null); // filename currently simulating
  const [simAnalyzing, setSimAnalyzing] = useState(false); // shows the analyzing indicator on the sim tile
  const simIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simVideoRef = useRef<HTMLVideoElement | null>(null);
  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const simAnalyzingRef = useRef(false); // guard against concurrent sim API calls

  // keep ref in sync so interval callbacks always see latest state
  useEffect(() => { activeCamerasRef.current = activeCameras; }, [activeCameras]);

  const addEvent = useCallback((msg: string, level = "info") => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    setEvents((prev) => [{ time, msg, level }, ...prev].slice(0, 30));
  }, []);

  // enumerate available cameras on mount
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((all) => {
      const cams = all
        .filter((d) => d.kind === "videoinput")
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
      setDevices(cams);
    });
  }, []);

  // fetch available video files from public/video_samples/
  useEffect(() => {
    fetch("/api/videos").then((r) => r.json()).then((d) => setVideoFiles(d.videos ?? []));
  }, []);

  const captureFrame = useCallback((deviceId: string): string | null => {
    const video = videoRefs.current[deviceId];
    const canvas = canvasRefs.current[deviceId];
    if (!video || !canvas || video.readyState < 2) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    canvas.width = 320; // increase if doing longer distance demo
    canvas.height = 180; // increase if doing longer distance demo
    ctx.drawImage(video, 0, 0, 320, 180);
    return canvas.toDataURL("image/jpeg", 0.65);
  }, []);

  // if motion < 0.4%, skip api call
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

  // IMPORTANT: if motion, send to api route.ts and analyze returned json
  const analyzeFrame = useCallback(async (deviceId: string, cameraLabel: string, frameData: string) => {
    if (deviceId === "sim") {
      setSimAnalyzing(true);
      simAnalyzingRef.current = true;
    } else {
      setActiveCameras((s) => s[deviceId] ? { ...s, [deviceId]: { ...s[deviceId], analyzing: true } } : s);
    }
    try {
      const base64 = frameData.split(",")[1];
      const res = await fetch("/api/analyze", {
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
            const key = `${cameraLabel}:${p.id}`;
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

      setStats((s) => ({ analyzed: s.analyzed + 1, skipped: s.skipped, lastAt: now }));
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
    video.src = `/video_samples/${filename}`;
    video.currentTime = 0;
    video.play();
    setSimulating(filename);
    addEvent(`Simulating: ${filename}`, "info");

    simIntervalRef.current = setInterval(() => {
      // skip if previous analysis still running — identical behavior to live feed
      if (simAnalyzingRef.current) return;
      const canvas = simCanvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.ended) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = 320; // increase if doing longer distance demo
      canvas.height = 180; // increase if doing longer distance demo
      ctx.drawImage(video, 0, 0, 320, 180);
      const frameData = canvas.toDataURL("image/jpeg", 0.65);
      analyzeFrame("sim", filename, frameData);
    }, SAMPLE_INTERVAL_MS);
  }, [addEvent, analyzeFrame]);

  const stopSimulation = useCallback(() => {
    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    if (simVideoRef.current) { simVideoRef.current.pause(); simVideoRef.current.src = ""; }
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
        } else {
          setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
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

  // cleanup all cameras on unmount
  useEffect(() => () => {
    Object.values(activeCamerasRef.current).forEach((cam) => {
      cam.stream.getTracks().forEach((t) => t.stop());
      if (cam.intervalId) clearInterval(cam.intervalId);
    });
  }, []);

  const criticalCount = patients.filter((p) => p.triage === "CRITICAL").length;
  const urgentCount = patients.filter((p) => p.triage === "URGENT").length;

  // html
  return (
    <div style={{ fontFamily: "var(--font-sans)", minHeight: "100vh", background: "var(--color-background-tertiary)" }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        .live-dot { animation: blink 1.2s ease infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>

      <header style={{ background: "var(--color-background-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: 28, height: 28, borderRadius: "var(--border-radius-md)", background: "var(--color-background-danger)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="var(--color-text-danger)" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <span style={{ fontWeight: 500, fontSize: 15, color: "var(--color-text-primary)" }}>Hospital triage AI</span>
        </div>
        <div style={{ display: "flex", gap: "20px", fontSize: 12, color: "var(--color-text-secondary)" }}>
          <span>Analyzed: <strong style={{ color: "var(--color-text-primary)" }}>{stats.analyzed}</strong></span>
          <span>Skipped (no motion): <strong style={{ color: "var(--color-text-primary)" }}>{stats.skipped}</strong></span>
          {stats.lastAt && <span>Last scan: <strong style={{ color: "var(--color-text-primary)" }}>{stats.lastAt}</strong></span>}
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "0", minHeight: "calc(100vh - 53px)" }}>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>

          {/* Camera selector — shows all detected devices, click to start/stop each */}
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

          {/* Simulate mode — play a video file through the same analysis pipeline */}
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

          {/* Live camera feeds grid — always rendered so simVideoRef is always mounted */}
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

            {/* Simulation tile — always in DOM so ref is available; hidden via CSS when inactive */}
            <div style={{ display: simulating ? "block" : (Object.values(activeCameras).length === 0 ? "block" : "none"), background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", position: "relative", aspectRatio: "16/9" }}>
              <video ref={simVideoRef} style={{ width: "100%", height: "100%", objectFit: "cover", display: simulating ? "block" : "none" }} muted playsInline loop />
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

          {patients.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setPatients([])} style={{ padding: "6px 14px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 12, background: "transparent", color: "var(--color-text-secondary)" }}>
                Clear patients
              </button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            {[
              { label: "Critical", count: criticalCount, cfg: TRIAGE_CONFIG.CRITICAL },
              { label: "Urgent", count: urgentCount, cfg: TRIAGE_CONFIG.URGENT },
              { label: "Total patients", count: patients.length, cfg: null },
            ].map(({ label, count, cfg }) => (
              <div key={label} style={{ background: cfg ? cfg.bg : "var(--color-background-secondary)", border: `0.5px solid ${cfg ? cfg.border : "var(--color-border-tertiary)"}`, borderRadius: "var(--border-radius-md)", padding: "12px 16px" }}>
                <div style={{ fontSize: 12, color: cfg ? cfg.text : "var(--color-text-secondary)", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 500, color: cfg ? cfg.text : "var(--color-text-primary)" }}>{count}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "16px", flex: 1 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: "10px", fontWeight: 500 }}>Event log</div>
            {events.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>No events yet.</div>
            ) : (
              events.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: "12px", marginBottom: "6px", fontSize: 12, borderBottom: i < events.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", paddingBottom: "6px" }}>
                  <span style={{ color: "var(--color-text-tertiary)", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}>{e.time}</span>
                  <span style={{ color: e.level === "critical" ? "var(--color-text-danger)" : e.level === "error" ? "var(--color-text-danger)" : e.level === "muted" ? "var(--color-text-tertiary)" : "var(--color-text-secondary)" }}>{e.msg}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ borderLeft: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", padding: "20px", overflowY: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "16px" }}>
            Patient triage board
          </div>

          {patients.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-text-tertiary)", fontSize: 13, lineHeight: 1.7 }}>
              No patients detected yet.<br />Start the camera to begin triage.
            </div>
          ) : (
            patients.map((p) => {
              const cfg = TRIAGE_CONFIG[p.triage] || TRIAGE_CONFIG.MONITORING;
              return (
                <div key={`${p.cameraLabel}:${p.id}`} style={{ background: "var(--color-background-secondary)", border: `0.5px solid ${cfg.border}`, borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontWeight: 500, fontSize: 14, color: "var(--color-text-primary)" }}>{p.id}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", background: cfg.bg, padding: "3px 10px", borderRadius: "var(--border-radius-md)" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot }} />
                      <span style={{ fontSize: 11, fontWeight: 500, color: cfg.text }}>{p.triage}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <span style={{ color: "var(--color-text-tertiary)" }}>Location</span>
                      <span>{p.location}</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <span style={{ color: "var(--color-text-tertiary)" }}>Posture</span>
                      <span>{p.posture} · {p.movement}</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <span style={{ color: "var(--color-text-tertiary)" }}>Note</span>
                      <span>{p.reason}</span>
                    </div>
                  </div>
                  <div style={{ marginTop: "8px", display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    <span>First seen: {p.firstSeen}</span>
                    <span>Conf: {Math.round((p.confidence || 0) * 100)}%</span>
                  </div>
                </div>
              );
            })
          )}

          <div style={{ marginTop: "24px", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "16px" }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "10px" }}>Triage scale</div>
            {Object.entries(TRIAGE_CONFIG).map(([level, cfg]) => (
              <div key={level} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", fontSize: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
                <span style={{ color: "var(--color-text-primary)", fontWeight: 500, minWidth: 80 }}>{level.charAt(0) + level.slice(1).toLowerCase()}</span>
                <span style={{ color: "var(--color-text-tertiary)" }}>{cfg.label}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "16px", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "16px" }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "8px" }}>Token efficiency</div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", lineHeight: 1.7 }}>
              Frames sampled every 4s. Motion detection skips static frames. Images compressed to 65% JPEG at 480×270px. JSON-only responses minimize output tokens.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

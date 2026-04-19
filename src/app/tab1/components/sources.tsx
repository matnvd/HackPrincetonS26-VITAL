"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Patient } from "@/app/tab1/types";
import Dashboard from "./Dashboard";

const SAMPLE_INTERVAL_MS = 3000; // decrease during demo? (if able to deal w/ rate limit)
const TRIGGER_COOLDOWN_MS = 15000;
const LYING_CONFIRM_MS = 2000;
const POSE_INTERVAL_MS = 120; // ~8fps inference, draw skeleton every rAF
const TRIAGE_ORDER: Record<string, number> = { CRITICAL: 0, URGENT: 1, STABLE: 2, MONITORING: 3 };

// COCO 17-keypoint skeleton connections for YOLOv8 pose
const POSE_CONNECTIONS = [
  [0,1],[0,2],[1,3],[2,4],          // face
  [5,6],[5,7],[7,9],[6,8],[8,10],   // arms
  [5,11],[6,12],[11,12],            // torso
  [11,13],[13,15],[12,14],[14,16],  // legs
];

function wordSimilarity(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\s+/));
  const wb = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...wa].filter((w) => wb.has(w)).length;
  return intersection / Math.max(wa.size, wb.size, 1);
}

// find an existing patient whose descriptor is ≥45% word-overlap with the incoming one
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

interface Keypoint { x: number; y: number; conf: number; }
type Posture = "standing" | "sitting" | "lying";
// Pose data sent back from the YOLOv8 worker (posture already classified off-thread)
interface WorkerPose { keypoints: Keypoint[]; score: number; posture: Posture; }

// crop video frame to each detected person's pose bounding box, sorted left-to-right
function computePersonCrops(video: HTMLVideoElement, poses: WorkerPose[]): string[] {
  if (poses.length === 0 || video.readyState < 2 || video.videoWidth === 0) return [];
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const tmp = document.createElement("canvas");
  const ctx = tmp.getContext("2d");
  if (!ctx) return [];

  const sorted = [...poses].sort((a, b) => {
    const cx = (p: WorkerPose) => { const xs = p.keypoints.filter(k=>k.conf>0.3).map(k=>k.x); return xs.length ? (Math.min(...xs)+Math.max(...xs))/2 : 0.5; };
    return cx(a) - cx(b);
  });

  return sorted.flatMap(pose => {
    const vis = pose.keypoints.filter(k => k.conf > 0.3);
    if (vis.length < 3) return [];
    const xs = vis.map(k => k.x), ys = vis.map(k => k.y);
    const bw = Math.max(...xs) - Math.min(...xs);
    const bh = Math.max(...ys) - Math.min(...ys);
    // add padding: 15% sides, 20% top (head room), 10% bottom
    const x1 = Math.max(0, Math.min(...xs) - bw * 0.15);
    const y1 = Math.max(0, Math.min(...ys) - bh * 0.20);
    const x2 = Math.min(1, Math.max(...xs) + bw * 0.15);
    const y2 = Math.min(1, Math.max(...ys) + bh * 0.10);
    const pw = (x2 - x1) * vw, ph = (y2 - y1) * vh;
    if (pw < 10 || ph < 10) return [];
    tmp.width = Math.round(pw);
    tmp.height = Math.round(ph);
    ctx.drawImage(video, x1 * vw, y1 * vh, pw, ph, 0, 0, tmp.width, tmp.height);
    return [tmp.toDataURL("image/jpeg", 0.82)];
  });
}

// draw skeleton overlay — green=standing, amber=sitting, red=lying
function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  keypoints: Keypoint[],
  w: number,
  h: number,
  posture: Posture,
) {
  if (w === 0 || h === 0) return;
  const color = posture === "lying" ? "#ef4444" : posture === "sitting" ? "#f59e0b" : "#22c55e";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  for (const [a, b] of POSE_CONNECTIONS) {
    const ka = keypoints[a];
    const kb = keypoints[b];
    if (!ka || !kb || ka.conf < 0.3 || kb.conf < 0.3) continue;
    ctx.beginPath();
    ctx.moveTo(ka.x * w, ka.y * h);
    ctx.lineTo(kb.x * w, kb.y * h);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  for (const kp of keypoints) {
    if (kp.conf < 0.3) continue;
    ctx.beginPath();
    ctx.arc(kp.x * w, kp.y * h, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

interface PoseState {
  lastPosture: Posture | null;
  lyingStartMs: number | null;
  lastTriggerMs: number;
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
  intervalId: ReturnType<typeof setInterval> | null;
}

interface Props { onPatientsChange?: (patients: Patient[]) => void; }

export default function HospitalTriageAI({ onPatientsChange }: Props = {}) {
  // per-camera video/canvas elements stored by deviceId
  const videoRefs   = useRef<Record<string, HTMLVideoElement | null>>({});
  const canvasRefs  = useRef<Record<string, HTMLCanvasElement | null>>({});
  const overlayRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const activeCamerasRef = useRef<Record<string, ActiveCamera>>({});

  // YOLOv8 worker refs — inference runs off-thread, main loop is purely sync draw + send
  const workerRef       = useRef<Worker | null>(null);
  const lastPosesRef    = useRef<Record<string, WorkerPose[]>>({});   // keyed by deviceId or "sim"
  const pendingRef      = useRef<Record<string, boolean>>({});         // true while worker is busy
  const lastInfTimeRef  = useRef<Record<string, number>>({});          // last send timestamp
  const poseStateRef    = useRef<Record<string, PoseState>>({});
  const rafIdRef        = useRef<Record<string, number>>({});
  const simOverlayRef   = useRef<HTMLCanvasElement | null>(null);
  const simPoseStateRef = useRef<PoseState>({ lastPosture: null, lyingStartMs: null, lastTriggerMs: 0 });
  const simRafIdRef     = useRef<number | null>(null);

  const [yoloReady, setYoloReady] = useState(false);
  const [poseMode, setPoseMode] = useState<"mediapipe" | "yolo">("mediapipe");
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [activeCameras, setActiveCameras] = useState<Record<string, ActiveCamera>>({});
  const [patients, setPatients] = useState<Patient[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => { onPatientsChange?.(patients); }, [patients, onPatientsChange]);

  // simulate mode — video files from public/video_samples/
  const [videoFiles, setVideoFiles] = useState<string[]>([]);
  const [simulating, setSimulating] = useState<string | null>(null); // filename currently simulating
  const [simAnalyzing, setSimAnalyzing] = useState(false); // shows the analyzing indicator on the sim tile
  const simVideoRef        = useRef<HTMLVideoElement | null>(null);
  const simCanvasRef       = useRef<HTMLCanvasElement | null>(null);
  const simIntervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const simAnalyzingRef    = useRef(false); // guard against concurrent sim API calls
  const simAnalysisDoneRef = useRef(false); // set after first pass so pose loop keeps drawing but stops triggering
  const simEndedHandlerRef = useRef<(() => void) | null>(null);
  const simulatingRef      = useRef<string | null>(null);

  // keep ref in sync so interval callbacks always see latest state
  useEffect(() => { activeCamerasRef.current = activeCameras; }, [activeCameras]);
  useEffect(() => { simulatingRef.current = simulating; }, [simulating]);

  const addEvent = useCallback((msg: string, level = "info") => {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    setEvents((prev) => [{ time, msg, level }, ...prev].slice(0, 30));
  }, []);

  const captureFromVideo = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null => {
    if (video.readyState < 2) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    canvas.width = 480; // increase if doing longer distance demo
    canvas.height = 270; // increase if doing longer distance demo
    ctx.drawImage(video, 0, 0, 320, 180);
    return canvas.toDataURL("image/jpeg", 0.65);
  }, []);

  // IMPORTANT: if anomaly detected by YOLOv8, send to api route.ts and analyze returned json
  const analyzeFrame = useCallback(async (deviceId: string, cameraLabel: string, frameData: string) => {
    // capture person crops synchronously now, before the async API round-trip
    const video = deviceId === "sim" ? simVideoRef.current : videoRefs.current[deviceId];
    const crops = video ? computePersonCrops(video, lastPosesRef.current[deviceId] ?? []) : [];

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
          (parsed.patients as Patient[]).forEach((p, i) => {
            const exactKey = `${cameraLabel}:${p.id}`;
            // prefer exact match, fall back to fuzzy match to avoid duplicates
            const key = map[exactKey] ? exactKey : (findSimilarKey(map, p.id, cameraLabel) ?? exactKey);
            // keep existing thumbnail — only set on first detection so the card doesn't flicker
            const thumbnail = map[key]?.thumbnail ?? crops[i] ?? crops[0] ?? frameData;
            map[key] = { ...p, thumbnail, cameraLabel, firstSeen: map[key]?.firstSeen || now, lastSeen: now };
          });
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

  // stable callback refs so the worker onmessage closure never goes stale
  const analyzeFrameRef    = useRef(analyzeFrame);
  const addEventRef        = useRef(addEvent);
  const captureFromVideoRef = useRef(captureFromVideo);
  useEffect(() => { analyzeFrameRef.current = analyzeFrame; }, [analyzeFrame]);
  useEffect(() => { addEventRef.current = addEvent; }, [addEvent]);
  useEffect(() => { captureFromVideoRef.current = captureFromVideo; }, [captureFromVideo]);

  // load YOLOv8n-pose ONNX model in a Web Worker — keeps inference off the React main thread
  useEffect(() => {
    const worker = new Worker(new URL("../workers/yolo.worker.ts", import.meta.url));
    workerRef.current = worker;
    worker.postMessage({ type: "load" });

    worker.onmessage = (e: MessageEvent) => {
      const { type, id, poses, error } = e.data as {
        type: string; id?: string; poses?: WorkerPose[]; error?: string;
      };

      if (type === "ready") { setYoloReady(true); setPoseMode(e.data.mode ?? "mediapipe"); return; }
      if (type === "mode-change") { setPoseMode(e.data.mode); return; }
      if (type === "load-error") { console.warn("[pose worker] failed to load:", error); return; }

      if (type === "poses" && id != null) {
        pendingRef.current[id] = false;
        lastPosesRef.current[id] = poses ?? [];

        // anomaly detection — same logic as before, now runs on main thread after worker responds
        const state = id === "sim" ? simPoseStateRef.current : poseStateRef.current[id];
        if (!state) return;

        const now = Date.now();
        if ((poses ?? []).length === 0) { state.lastPosture = null; state.lyingStartMs = null; }

        for (const pose of (poses ?? [])) {
          const { posture } = pose;
          const fell = state.lastPosture === "standing" && posture === "lying";
          if (fell) state.lyingStartMs = now;
          if (posture !== "lying") state.lyingStartMs = null;
          const sustainedLying = posture === "lying" && state.lyingStartMs !== null && now - state.lyingStartMs > LYING_CONFIRM_MS;

          if (id === "sim") {
            // skip if previous analysis still running, or first pass already completed
            if (
              (fell || sustainedLying) &&
              now - state.lastTriggerMs > TRIGGER_COOLDOWN_MS &&
              !simAnalyzingRef.current &&
              !simAnalysisDoneRef.current
            ) {
              state.lastTriggerMs = now;
              const video = simVideoRef.current;
              const canvas = simCanvasRef.current;
              if (video && canvas) {
                const frameData = captureFromVideoRef.current(video, canvas);
                if (frameData) {
                  addEventRef.current(`[${simulatingRef.current ?? "sim"}] Anomaly detected — triggering Claude`, "info");
                  analyzeFrameRef.current("sim", simulatingRef.current ?? "sim", frameData);
                }
              }
            }
          } else {
            const cam = activeCamerasRef.current[id];
            const label = cam?.label ?? id;
            const canvas = canvasRefs.current[id];
            if ((fell || sustainedLying) && now - state.lastTriggerMs > TRIGGER_COOLDOWN_MS && canvas) {
              state.lastTriggerMs = now;
              const video = videoRefs.current[id];
              if (video) {
                const frameData = captureFromVideoRef.current(video, canvas);
                if (frameData) {
                  addEventRef.current(`[${label}] Anomaly detected — triggering Claude`, "info");
                  analyzeFrameRef.current(id, label, frameData);
                }
              }
            }
          }
          state.lastPosture = posture;
        }
      }
    };

    return () => { worker.terminate(); workerRef.current = null; };
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
    fetch("/api/tab1/videos").then((r) => r.json()).then((d) => setVideoFiles(d.videos ?? []));
  }, []);

  const stopPoseLoop = useCallback((deviceId: string) => {
    const id = rafIdRef.current[deviceId];
    if (id) cancelAnimationFrame(id);
    delete rafIdRef.current[deviceId];
    delete poseStateRef.current[deviceId];
    delete lastPosesRef.current[deviceId];
    delete pendingRef.current[deviceId];
    delete lastInfTimeRef.current[deviceId];
  }, []);

  // rAF loop per camera — synchronous: draws cached poses, sends frame to worker at throttled rate
  const startPoseLoop = useCallback((deviceId: string) => {
    if (!workerRef.current) return;
    poseStateRef.current[deviceId] = { lastPosture: null, lyingStartMs: null, lastTriggerMs: 0 };
    lastPosesRef.current[deviceId] = [];
    pendingRef.current[deviceId] = false;
    lastInfTimeRef.current[deviceId] = 0;

    const loop = () => {
      const video   = videoRefs.current[deviceId];
      const overlay = overlayRefs.current[deviceId];

      if (!video || !overlay || video.readyState < 2) {
        rafIdRef.current[deviceId] = requestAnimationFrame(loop);
        return;
      }

      const w = overlay.offsetWidth;
      const h = overlay.offsetHeight;
      if (w !== overlay.width)  overlay.width  = w;
      if (h !== overlay.height) overlay.height = h;
      const ctx = overlay.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, w, h);

      // draw last known skeleton every frame for smooth overlay
      if (ctx && w > 0 && h > 0) {
        for (const pose of (lastPosesRef.current[deviceId] ?? [])) {
          drawSkeleton(ctx, pose.keypoints, w, h, pose.posture);
        }
      }

      // kick off inference at throttled rate — non-blocking (worker handles it)
      const now = Date.now();
      if (!pendingRef.current[deviceId] && now - (lastInfTimeRef.current[deviceId] ?? 0) >= POSE_INTERVAL_MS && workerRef.current) {
        pendingRef.current[deviceId] = true;
        lastInfTimeRef.current[deviceId] = now;
        // ImageBitmap is GPU-accelerated and transferable (zero-copy) to the worker
        createImageBitmap(video).then((bitmap) => {
          workerRef.current?.postMessage({ type: "infer", id: deviceId, bitmap }, [bitmap]);
        });
      }

      rafIdRef.current[deviceId] = requestAnimationFrame(loop);
    };
    rafIdRef.current[deviceId] = requestAnimationFrame(loop);
  }, []);

  const stopSimPoseLoop = useCallback(() => {
    if (simRafIdRef.current) cancelAnimationFrame(simRafIdRef.current);
    simRafIdRef.current = null;
    lastPosesRef.current["sim"] = [];
    pendingRef.current["sim"] = false;
  }, []);

  const startSimPoseLoop = useCallback((filename: string) => {
    if (!workerRef.current) return;
    simPoseStateRef.current = { lastPosture: null, lyingStartMs: null, lastTriggerMs: 0 };
    lastPosesRef.current["sim"] = [];
    pendingRef.current["sim"] = false;
    lastInfTimeRef.current["sim"] = 0;

    const loop = () => {
      if (!simulatingRef.current) return; // sim was stopped
      const video   = simVideoRef.current;
      const overlay = simOverlayRef.current;

      if (!video || !overlay || video.readyState < 2 || video.ended) {
        simRafIdRef.current = requestAnimationFrame(loop);
        return;
      }

      const w = overlay.offsetWidth;
      const h = overlay.offsetHeight;
      if (w !== overlay.width)  overlay.width  = w;
      if (h !== overlay.height) overlay.height = h;
      const ctx = overlay.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, w, h);

      // draw last known skeleton every frame for smooth overlay
      if (ctx && w > 0 && h > 0) {
        for (const pose of (lastPosesRef.current["sim"] ?? [])) {
          drawSkeleton(ctx, pose.keypoints, w, h, pose.posture);
        }
      }

      // kick off inference at throttled rate — non-blocking (worker handles it)
      const now = Date.now();
      if (!pendingRef.current["sim"] && now - (lastInfTimeRef.current["sim"] ?? 0) >= POSE_INTERVAL_MS && workerRef.current) {
        pendingRef.current["sim"] = true;
        lastInfTimeRef.current["sim"] = now;
        // ImageBitmap is GPU-accelerated and transferable (zero-copy) to the worker
        createImageBitmap(video).then((bitmap) => {
          workerRef.current?.postMessage({ type: "infer", id: "sim", bitmap }, [bitmap]);
        });
      }

      // filename used only for event label — passed via closure, not re-evaluated
      void filename;
      simRafIdRef.current = requestAnimationFrame(loop);
    };
    simRafIdRef.current = requestAnimationFrame(loop);
  }, []);

  // start/stop pose loops as cameras become active or inactive
  const prevCameraIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!yoloReady) return;
    const current = new Set(Object.keys(activeCameras));
    for (const id of current) {
      if (!prevCameraIdsRef.current.has(id)) startPoseLoop(id);
    }
    for (const id of prevCameraIdsRef.current) {
      if (!current.has(id)) stopPoseLoop(id);
    }
    prevCameraIdsRef.current = current;
  }, [activeCameras, yoloReady, startPoseLoop, stopPoseLoop]);

  const startSimulation = useCallback((filename: string) => {
    const video = simVideoRef.current;
    if (!video) return;

    // remove any prior ended listener
    if (simEndedHandlerRef.current) video.removeEventListener("ended", simEndedHandlerRef.current);
    stopSimPoseLoop();
    simAnalysisDoneRef.current = false;

    video.src = `/video_samples/${filename}`;
    video.currentTime = 0;
    video.play();
    setSimulating(filename);
    addEvent(`Simulating: ${filename}`, "info");

    // analyze the first frame as soon as the video is ready
    const handleCanPlay = () => {
      video.removeEventListener("canplay", handleCanPlay);
      const canvas = simCanvasRef.current;
      if (canvas && !simAnalyzingRef.current) {
        const frameData = captureFromVideo(video, canvas);
        if (frameData) analyzeFrame("sim", filename, frameData);
      }
    };
    video.addEventListener("canplay", handleCanPlay);

    if (workerRef.current) startSimPoseLoop(filename);

    simIntervalRef.current = setInterval(() => {
      if (simAnalyzingRef.current) return;
      const canvas = simCanvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.ended) return;
      const frameData = captureFromVideo(video, canvas);
      if (frameData) analyzeFrame("sim", filename, frameData);
    }, SAMPLE_INTERVAL_MS);

    // when the video finishes its first pass: stop analysis, keep looping visually
    const handleEnded = () => {
      simAnalysisDoneRef.current = true; // blocks further Claude triggers but pose overlay keeps running
      if (simIntervalRef.current) { clearInterval(simIntervalRef.current); simIntervalRef.current = null; }
      video.currentTime = 0;
      video.play();
      addEvent(`[${filename}] Playback looping — analysis complete`, "muted");
    };
    simEndedHandlerRef.current = handleEnded;
    video.addEventListener("ended", handleEnded);
  }, [addEvent, analyzeFrame, captureFromVideo, startSimPoseLoop, stopSimPoseLoop]);

  const stopSimulation = useCallback(() => {
    stopSimPoseLoop();
    if (simIntervalRef.current) { clearInterval(simIntervalRef.current); simIntervalRef.current = null; }
    const video = simVideoRef.current;
    if (video) {
      if (simEndedHandlerRef.current) video.removeEventListener("ended", simEndedHandlerRef.current);
      video.pause();
      video.src = "";
    }
    simEndedHandlerRef.current = null;
    setSimulating(null);
    addEvent("Simulation stopped", "muted");
  }, [addEvent, stopSimPoseLoop]);

  const startCamera = useCallback(async (device: CameraDevice) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: device.deviceId }, width: 640, height: 480 },
      });

      const intervalId = setInterval(() => {
        const video  = videoRefs.current[device.deviceId];
        const canvas = canvasRefs.current[device.deviceId];
        if (!video || !canvas) return;
        const frameData = captureFromVideo(video, canvas);
        if (frameData) analyzeFrame(device.deviceId, activeCamerasRef.current[device.deviceId]?.label ?? device.label, frameData);
      }, SAMPLE_INTERVAL_MS);

      // pose loop starts via the activeCameras useEffect once the camera is registered
      const cam: ActiveCamera = { deviceId: device.deviceId, label: device.label, stream, analyzing: false, intervalId };
      setActiveCameras((prev) => ({ ...prev, [device.deviceId]: cam }));

      // analyze the first frame as soon as the video element is ready
      const triggerFirst = () => {
        const video  = videoRefs.current[device.deviceId];
        const canvas = canvasRefs.current[device.deviceId];
        if (video && canvas) {
          video.removeEventListener("canplay", triggerFirst);
          const frameData = captureFromVideo(video, canvas);
          if (frameData) analyzeFrame(device.deviceId, device.label, frameData);
        }
      };
      // video ref is set after re-render, so defer listener attachment slightly
      setTimeout(() => {
        const video = videoRefs.current[device.deviceId];
        if (video) video.addEventListener("canplay", triggerFirst);
      }, 0);

      addEvent(`${device.label} started`, "info");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addEvent(`${device.label}: ` + (msg.includes("denied") ? "Camera access denied." : msg), "error");
    }
  }, [addEvent, analyzeFrame, captureFromVideo]);

  const stopCamera = useCallback((deviceId: string) => {
    const cam = activeCamerasRef.current[deviceId];
    if (!cam) return;
    cam.stream.getTracks().forEach((t) => t.stop());
    if (cam.intervalId) clearInterval(cam.intervalId);
    stopPoseLoop(deviceId);
    addEvent(`${cam.label} stopped`, "muted");
    setActiveCameras((prev) => { const next = { ...prev }; delete next[deviceId]; return next; });
  }, [addEvent, stopPoseLoop]);

  // cleanup all cameras on unmount
  useEffect(() => () => {
    Object.values(activeCamerasRef.current).forEach((cam) => {
      cam.stream.getTracks().forEach((t) => t.stop());
      if (cam.intervalId) clearInterval(cam.intervalId);
    });
    Object.keys(rafIdRef.current).forEach((id) => cancelAnimationFrame(rafIdRef.current[id]));
    if (simRafIdRef.current) cancelAnimationFrame(simRafIdRef.current);
  }, []);

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const handleDismiss = useCallback((key: string) => {
    setDismissed((prev) => new Set([...prev, key]));
  }, []);
  const visible = patients.filter((p) => !dismissed.has(`${p.cameraLabel}:${p.id}`));

  // html
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

          {/* Pose model status indicator */}
          <div style={{ fontSize: 11 }}>
            {yoloReady
              ? poseMode === "yolo"
                ? <span style={{ color: "#f59e0b" }}>● YOLOv8 active — 3+ people detected</span>
                : <span style={{ color: "#22c55e" }}>● MediaPipe active — fast single/dual person tracking</span>
              : <span style={{ color: "#475569" }}>○ Loading pose model…</span>
            }
          </div>

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
                {/* Pose skeleton overlay */}
                <canvas
                  ref={(el) => { overlayRefs.current[cam.deviceId] = el; }}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                />
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
              <video ref={simVideoRef} style={{ width: "100%", height: "100%", objectFit: "cover", display: simulating ? "block" : "none" }} muted playsInline />
              <canvas ref={simCanvasRef} style={{ display: "none" }} />
              {/* Sim pose skeleton overlay */}
              <canvas
                ref={simOverlayRef}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", display: simulating ? "block" : "none" }}
              />
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

          {/* Event log */}
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

        {/* Right panel — pretty patient cards */}
        <div style={{ padding: "20px", overflowY: "auto", background: "#07070e" }}>
          <Dashboard patients={visible} onDismiss={handleDismiss} />
        </div>
      </div>
    </div>
  );
}

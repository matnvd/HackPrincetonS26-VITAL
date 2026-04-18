"use client";

import { useEffect, useRef, useState } from "react";

// Strategy: load BlazeFace (fast, ~1s) immediately for instant boxes.
// Load EfficientDet (slow, ~4s) in the background; upgrade to body boxes once ready.
// Boxes appear the moment the camera starts — no waiting for the big model.

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
}

const PERSON_COLORS = ["#00ff88", "#38bdf8", "#fb923c", "#a78bfa"];

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string, label: string
) {
  // Semi-transparent fill
  ctx.fillStyle = color + "18";
  ctx.fillRect(x, y, w, h);

  // Solid border
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.strokeRect(x, y, w, h);

  // Corner accents
  const arm = Math.min(w, h) * 0.2;
  ctx.lineWidth = 3;
  const corners: [number, number, number, number, number, number][] = [
    [x,         y + arm,     x,     y,     x + arm,     y    ],
    [x + w - arm, y,         x + w, y,     x + w,       y + arm],
    [x,         y + h - arm, x,     y + h, x + arm,     y + h],
    [x + w - arm, y + h,     x + w, y + h, x + w,   y + h - arm],
  ];
  for (const [x1, y1, x2, y2, x3, y3] of corners) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // Label pill
  const fontSize = Math.max(11, Math.min(14, w * 0.12));
  ctx.font = `bold ${fontSize}px monospace`;
  const tw = ctx.measureText(label).width;
  const ly = y > fontSize + 8 ? y - 4 : y + h + fontSize + 4;
  ctx.fillStyle = color + "dd";
  ctx.beginPath();
  ctx.roundRect(x, ly - fontSize - 2, tw + 8, fontSize + 6, 3);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.fillText(label, x + 4, ly);
}

function drawScanLine(ctx: CanvasRenderingContext2D, w: number, h: number) {
  if (!w || !h) return;
  const y = (performance.now() / 8) % h;
  const grad = ctx.createLinearGradient(0, y - 14, 0, y + 14);
  grad.addColorStop(0, "transparent");
  grad.addColorStop(0.5, "#00ff8844");
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.fillRect(0, y - 14, w, 28);
}

// ── Detector loaders ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadFaceDetector(): Promise<any> {
  const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );
  return FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    minDetectionConfidence: 0.4,
    minSuppressionThreshold: 0.3,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadBodyDetector(): Promise<any> {
  const { ObjectDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );
  const opts = {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite",
    },
    runningMode: "VIDEO" as const,
    scoreThreshold: 0.2,
    categoryAllowlist: ["person"],
    maxResults: 5,
  };
  try {
    return await ObjectDetector.createFromOptions(vision, {
      ...opts, baseOptions: { ...opts.baseOptions, delegate: "GPU" },
    });
  } catch {
    return ObjectDetector.createFromOptions(vision, {
      ...opts, baseOptions: { ...opts.baseOptions, delegate: "CPU" },
    });
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PersonOverlay({ videoRef, active }: Props) {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const faceRef       = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bodyRef       = useRef<any>(null);
  const rafRef        = useRef<number>(0);
  const countRef      = useRef(0);

  const [faceReady, setFaceReady] = useState(false);
  const [bodyReady, setBodyReady] = useState(false);
  const [faceErr,   setFaceErr]   = useState(false);
  const [detectedCount, setDetectedCount] = useState(0);

  // Load BlazeFace immediately (fast, reliable)
  useEffect(() => {
    let cancelled = false;
    loadFaceDetector()
      .then((d) => { if (!cancelled) { faceRef.current = d; setFaceReady(true); } })
      .catch(() => { if (!cancelled) setFaceErr(true); });
    return () => { cancelled = true; };
  }, []);

  // Load EfficientDet in background (slower, full body)
  useEffect(() => {
    let cancelled = false;
    loadBodyDetector()
      .then((d) => { if (!cancelled) { bodyRef.current = d; setBodyReady(true); } })
      .catch(() => { /* body detector optional — face fallback still works */ });
    return () => { cancelled = true; };
  }, []);

  // Render loop — run as soon as face detector is ready
  useEffect(() => {
    if (!active || !faceReady) return;

    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const loop = () => {
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width  = rect.width;
        canvas.height = rect.height;
      }

      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawScanLine(ctx, canvas.width, canvas.height);

      if (video.readyState >= 2) {
        const now = performance.now();
        const sx  = canvas.width  / video.videoWidth;
        const sy  = canvas.height / video.videoHeight;

        // ── Prefer body detector (full person) when ready ────────────────────
        if (bodyReady && bodyRef.current) {
          try {
            const result = bodyRef.current.detectForVideo(video, now);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dets = (result.detections ?? []).slice(0, 5) as any[];
            dets.forEach((det, i) => {
              const bb = det.boundingBox;
              if (!bb) return;
              const score = det.categories?.[0]?.score ?? 0;
              drawBox(
                ctx,
                bb.originX * sx, bb.originY * sy,
                bb.width   * sx, bb.height  * sy,
                PERSON_COLORS[i % PERSON_COLORS.length],
                `PERSON ${i + 1}  ${Math.round(score * 100)}%`
              );
            });
            countRef.current = dets.length;
            rafRef.current = requestAnimationFrame(loop);
            return;
          } catch { /* fall through to face detector */ }
        }

        // ── Fallback: BlazeFace (always available, very fast) ────────────────
        if (faceRef.current) {
          try {
            const result = faceRef.current.detectForVideo(video, now);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const dets = (result.detections ?? []).slice(0, 5) as any[];
            dets.forEach((det, i) => {
              const bb = det.boundingBox;
              if (!bb) return;
              // Expand face bbox to approximate a person box
              const fx = bb.originX * sx;
              const fy = bb.originY * sy;
              const fw = bb.width   * sx;
              const fh = bb.height  * sy;
              // Center on face, extend down ~3.5× and widen to ~1.5×
              const pw = fw * 1.6;
              const ph = fh * 4.5;
              const px = fx + fw / 2 - pw / 2;
              const py = fy - fh * 0.2;
              drawBox(
                ctx,
                Math.max(0, px), Math.max(0, py),
                Math.min(canvas.width  - Math.max(0, px), pw),
                Math.min(canvas.height - Math.max(0, py), ph),
                PERSON_COLORS[i % PERSON_COLORS.length],
                `PERSON ${i + 1}`
              );
            });
            countRef.current = dets.length;
          } catch { /* skip frame */ }
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    const badgeInterval = setInterval(() => setDetectedCount(countRef.current), 800);
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(badgeInterval);
    };
  // Re-run when body detector becomes available so we upgrade mid-session
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, faceReady, bodyReady, videoRef]);

  return (
    <>
      {active && (
        <div className="absolute bottom-2 left-2 flex flex-col gap-1 items-start pointer-events-none">
          {!faceReady && !faceErr && (
            <span className="px-2 py-0.5 rounded bg-black/70 text-yellow-400 text-xs font-mono animate-pulse">
              ⏳ loading detector…
            </span>
          )}
          {faceErr && (
            <span className="px-2 py-0.5 rounded bg-red-900/80 text-red-300 text-xs font-mono">
              ✗ detector failed
            </span>
          )}
          {faceReady && (
            <span className={`px-2 py-0.5 rounded text-xs font-mono ${
              detectedCount > 0 ? "bg-black/70 text-green-400" : "bg-black/50 text-gray-500"
            }`}>
              {detectedCount > 0
                ? `👤 ${detectedCount} person${detectedCount > 1 ? "s" : ""} detected${bodyReady ? "" : " (face mode)"}`
                : "scanning…"}
            </span>
          )}
        </div>
      )}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
    </>
  );
}

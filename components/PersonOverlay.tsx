"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
}

const PERSON_COLORS = ["#00ff88", "#38bdf8", "#fb923c", "#a78bfa"];

function drawPersonBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string, index: number, score: number
) {
  // Semi-transparent fill so boxes are visible at any distance
  ctx.fillStyle = color + "18";
  ctx.fillRect(x, y, w, h);

  // Solid border
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.strokeRect(x, y, w, h);

  // Corner accent brackets on top of the solid rect
  const arm = Math.min(w, h) * 0.2;
  ctx.lineWidth = 3;
  const corners: [number, number, number, number, number, number][] = [
    [x,         y + arm,     x,     y,     x + arm,     y    ],
    [x + w - arm, y,         x + w, y,     x + w,       y + arm],
    [x,         y + h - arm, x,     y + h, x + arm,     y + h],
    [x + w - arm, y + h,     x + w, y + h, x + w,   y + h - arm],
  ];
  for (const [x1, y1, x2, y2, x3, y3] of corners) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // Label — person number + confidence
  const label = `P${index}  ${Math.round(score * 100)}%`;
  const fontSize = Math.max(11, Math.min(14, w * 0.12));
  ctx.font = `bold ${fontSize}px monospace`;
  const textW = ctx.measureText(label).width;
  const labelY = y > fontSize + 6 ? y - 4 : y + fontSize + 4;

  // Label background pill
  ctx.fillStyle = color + "cc";
  ctx.beginPath();
  ctx.roundRect(x, labelY - fontSize - 1, textW + 8, fontSize + 4, 3);
  ctx.fill();

  ctx.fillStyle = "#000";
  ctx.fillText(label, x + 4, labelY);
}

function drawScanLine(ctx: CanvasRenderingContext2D, w: number, h: number) {
  if (!w || !h) return;
  const y = (performance.now() / 8) % h;
  const grad = ctx.createLinearGradient(0, y - 14, 0, y + 14);
  grad.addColorStop(0,   "transparent");
  grad.addColorStop(0.5, "#00ff8844");
  grad.addColorStop(1,   "transparent");
  ctx.fillStyle = grad;
  ctx.fillRect(0, y - 14, w, 28);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildDetector(): Promise<any> {
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
    scoreThreshold: 0.2,   // low threshold — catches distant/partial people
    categoryAllowlist: ["person"],
    maxResults: 5,
  };

  // Try GPU first, fall back to CPU if it throws
  try {
    return await ObjectDetector.createFromOptions(vision, {
      ...opts,
      baseOptions: { ...opts.baseOptions, delegate: "GPU" },
    });
  } catch {
    console.warn("PersonOverlay: GPU delegate failed, retrying with CPU");
    return await ObjectDetector.createFromOptions(vision, {
      ...opts,
      baseOptions: { ...opts.baseOptions, delegate: "CPU" },
    });
  }
}

export default function PersonOverlay({ videoRef, active }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detectorRef  = useRef<any>(null);
  const rafRef       = useRef<number>(0);
  const countRef     = useRef<number>(0);   // live detection count for the badge

  const [status, setStatus]           = useState<"loading" | "ready" | "error">("loading");
  const [detectedCount, setDetectedCount] = useState(0);
  const [errorDetail, setErrorDetail] = useState("");

  // ── Load model ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    buildDetector()
      .then((det) => {
        if (!cancelled) { detectorRef.current = det; setStatus("ready"); }
      })
      .catch((err) => {
        console.error("PersonOverlay: model load failed", err);
        if (!cancelled) {
          setErrorDetail(String(err?.message ?? err).slice(0, 80));
          setStatus("error");
        }
      });
    return () => { cancelled = true; };
  }, []);

  // ── Render loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || status !== "ready") return;

    const video    = videoRef.current;
    const canvas   = canvasRef.current;
    const detector = detectorRef.current;
    if (!video || !canvas || !detector) return;

    const loop = () => {
      // Keep canvas pixel-perfect with the displayed video size
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width  = rect.width;
        canvas.height = rect.height;
      }

      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawScanLine(ctx, canvas.width, canvas.height);

      if (video.readyState >= 2) {
        try {
          const result = detector.detectForVideo(video, performance.now());

          // MediaPipe bboxes are in native video pixel space — scale to canvas display
          const sx = canvas.width  / video.videoWidth;
          const sy = canvas.height / video.videoHeight;

          const dets = (result.detections ?? []).slice(0, 5);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          dets.forEach((det: any, i: number) => {
            const bb    = det.boundingBox;
            const score = det.categories?.[0]?.score ?? 0;
            if (!bb) return;
            drawPersonBox(
              ctx,
              bb.originX * sx, bb.originY * sy,
              bb.width   * sx, bb.height  * sy,
              PERSON_COLORS[i % PERSON_COLORS.length], i + 1, score
            );
          });

          // Update count ref every frame, throttle state update to avoid excessive re-renders
          countRef.current = dets.length;
        } catch {
          // skip frame
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    // Throttle the React state update (detection badge) to once per second
    const badgeInterval = setInterval(() => setDetectedCount(countRef.current), 1000);

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(badgeInterval);
    };
  }, [active, status, videoRef]);

  return (
    <>
      {/* Status badges — always rendered so user knows what's happening */}
      {active && (
        <div className="absolute bottom-2 left-2 flex flex-col gap-1 items-start pointer-events-none">
          {status === "loading" && (
            <span className="px-2 py-0.5 rounded bg-black/70 text-yellow-400 text-xs font-mono animate-pulse">
              ⏳ loading detector…
            </span>
          )}
          {status === "error" && (
            <span className="px-2 py-0.5 rounded bg-red-900/80 text-red-300 text-xs font-mono" title={errorDetail}>
              ✗ detector failed — check console
            </span>
          )}
          {status === "ready" && (
            <span className={`px-2 py-0.5 rounded text-xs font-mono ${
              detectedCount > 0
                ? "bg-black/70 text-green-400"
                : "bg-black/50 text-gray-500"
            }`}>
              {detectedCount > 0
                ? `👤 ${detectedCount} person${detectedCount > 1 ? "s" : ""} detected`
                : "scanning…"}
            </span>
          )}
        </div>
      )}

      {/* The overlay canvas — always present so scan line shows even before model ready */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

// Uses BlazeFace (same model as the original working FaceOverlay).
// Fast, reliable, loads in ~1s. Labels detections PERSON 1…N with bracket boxes.

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
}

const PERSON_COLORS = ["#00ff88", "#38bdf8", "#fb923c", "#a78bfa"];

function drawPersonBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string, index: number
) {
  const arm = Math.min(w, h) * 0.22;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;

  const corners: [number, number, number, number, number, number][] = [
    [x,           y + arm,   x,     y,     x + arm,   y    ],
    [x + w - arm, y,         x + w, y,     x + w,     y + arm],
    [x,           y + h - arm, x,   y + h, x + arm,   y + h],
    [x + w - arm, y + h,     x + w, y + h, x + w, y + h - arm],
  ];
  for (const [x1, y1, x2, y2, x3, y3] of corners) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.stroke();
  }

  const fontSize = Math.max(11, Math.min(15, w * 0.13));
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.fillStyle = color;
  ctx.shadowBlur = 10;
  ctx.fillText(`PERSON ${index}`, x + 2, y - 7 < fontSize ? y + fontSize + 4 : y - 7);
  ctx.shadowBlur = 0;
}

function drawScanLine(ctx: CanvasRenderingContext2D, w: number, h: number) {
  if (!w || !h) return;
  const y = (performance.now() / 8) % h;
  const grad = ctx.createLinearGradient(0, y - 12, 0, y + 12);
  grad.addColorStop(0,   "transparent");
  grad.addColorStop(0.5, "#00ff8833");
  grad.addColorStop(1,   "transparent");
  ctx.fillStyle = grad;
  ctx.fillRect(0, y - 12, w, 24);
}

export default function PersonOverlay({ videoRef, active }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detectorRef = useRef<any>(null);
  const rafRef      = useRef<number>(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.4,
          minSuppressionThreshold: 0.3,
        });
        if (!cancelled) { detectorRef.current = detector; setStatus("ready"); }
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!active || status !== "ready") return;

    const video    = videoRef.current;
    const canvas   = canvasRef.current;
    const detector = detectorRef.current;
    if (!video || !canvas || !detector) return;

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
        try {
          const result = detector.detectForVideo(video, performance.now());
          const sx = canvas.width  / video.videoWidth;
          const sy = canvas.height / video.videoHeight;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          result.detections.slice(0, 5).forEach((det: any, i: number) => {
            const bb = det.boundingBox;
            if (!bb) return;

            // BlazeFace returns face bbox. Expand it to approximate the full body:
            //   width  ×2.4  (shoulders are ~2.4× face width)
            //   height ×5.5  (standing body is ~5-6× head height)
            //   shift up 0.3× face height so forehead isn't cropped
            const fx = bb.originX * sx;
            const fy = bb.originY * sy;
            const fw = bb.width   * sx;
            const fh = bb.height  * sy;

            const bw = fw * 2.4;
            const bh = fh * 5.5;
            const bx = Math.max(0, fx + fw / 2 - bw / 2);
            const by = Math.max(0, fy - fh * 0.3);
            const clampW = Math.min(canvas.width  - bx, bw);
            const clampH = Math.min(canvas.height - by, bh);

            drawPersonBox(ctx, bx, by, clampW, clampH,
              PERSON_COLORS[i % PERSON_COLORS.length], i + 1);
          });
        } catch { /* skip frame */ }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, status, videoRef]);

  return (
    <>
      {status === "loading" && active && (
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 text-yellow-400 text-xs font-mono animate-pulse">
          loading detector…
        </div>
      )}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
    </>
  );
}

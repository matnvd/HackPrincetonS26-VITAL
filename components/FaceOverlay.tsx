"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean; // only run the loop when camera is live
}

// Landmark indices returned by MediaPipe blaze_face_short_range:
// 0 right eye, 1 left eye, 2 nose tip, 3 mouth center, 4 right ear, 5 left ear
const LANDMARK_STYLE: Record<number, { color: string; r: number; label: string }> = {
  0: { color: "#38bdf8", r: 4, label: "R EYE" },
  1: { color: "#38bdf8", r: 4, label: "L EYE" },
  2: { color: "#ffffff", r: 3, label: "NOSE"  },
  3: { color: "#f472b6", r: 3, label: "MOUTH" },
  4: { color: "#a3e635", r: 2, label: ""      },
  5: { color: "#a3e635", r: 2, label: ""      },
};

function drawBrackets(
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
    [x,         y + arm,   x,     y,     x + arm,   y    ],
    [x + w - arm, y,       x + w, y,     x + w,     y + arm],
    [x,         y + h - arm, x,   y + h, x + arm,   y + h],
    [x + w - arm, y + h,   x + w, y + h, x + w, y + h - arm],
  ];
  for (const [x1, y1, x2, y2, x3, y3] of corners) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.stroke();
  }

  // Label above box
  const fontSize = Math.max(11, Math.min(15, w * 0.13));
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.fillStyle = color;
  ctx.shadowBlur = 10;
  ctx.fillText(`PERSON ${index}`, x + 2, y - 7);

  ctx.shadowBlur = 0;
}

function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  keypoints: { x: number; y: number }[],
  canvasW: number, canvasH: number
) {
  keypoints.forEach((kp, i) => {
    const style = LANDMARK_STYLE[i] ?? { color: "#ffffff", r: 2, label: "" };
    const px = kp.x * canvasW;
    const py = kp.y * canvasH;

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(px, py, style.r + 3, 0, Math.PI * 2);
    ctx.strokeStyle = style.color + "55";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Filled dot
    ctx.beginPath();
    ctx.arc(px, py, style.r, 0, Math.PI * 2);
    ctx.fillStyle = style.color;
    ctx.shadowColor = style.color;
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Label (only if non-empty and box is wide enough)
    if (style.label) {
      ctx.font = "bold 9px monospace";
      ctx.fillStyle = style.color + "cc";
      ctx.fillText(style.label, px + style.r + 3, py + 3);
    }
  });
}

function drawScanLine(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const y = (performance.now() / 8) % h;
  const grad = ctx.createLinearGradient(0, y - 12, 0, y + 12);
  grad.addColorStop(0,   "transparent");
  grad.addColorStop(0.5, "#00ff8833");
  grad.addColorStop(1,   "transparent");
  ctx.fillStyle = grad;
  ctx.fillRect(0, y - 12, w, 24);
}

export default function FaceOverlay({ videoRef, active }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detectorRef = useRef<any>(null);
  const rafRef     = useRef<number>(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // ── Load MediaPipe model ──────────────────────────────────────────────────
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
          minDetectionConfidence: 0.45,
          minSuppressionThreshold: 0.3,
        });
        if (!cancelled) {
          detectorRef.current = detector;
          setStatus("ready");
        }
      } catch (err) {
        console.error("FaceOverlay: model load failed", err);
        if (!cancelled) setStatus("error");
      }
    })();
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
      // Sync canvas pixel dimensions to the video's displayed size
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width  || canvas.height !== rect.height) {
        canvas.width  = rect.width;
        canvas.height = rect.height;
      }

      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw scan line even before detection
      drawScanLine(ctx, canvas.width, canvas.height);

      if (video.readyState >= 2) {
        try {
          const result = detector.detectForVideo(video, performance.now());

          // MediaPipe bounding boxes are in the video's native pixel space;
          // scale to canvas display size.
          const sx = canvas.width  / video.videoWidth;
          const sy = canvas.height / video.videoHeight;

          result.detections.forEach((det: { boundingBox: { originX: number; originY: number; width: number; height: number }; keypoints: { x: number; y: number }[] }, i: number) => {
            const bb = det.boundingBox;
            const color = "#00ff88";
            drawBrackets(
              ctx,
              bb.originX * sx, bb.originY * sy,
              bb.width   * sx, bb.height  * sy,
              color, i + 1
            );
            if (det.keypoints?.length) {
              drawLandmarks(ctx, det.keypoints, canvas.width, canvas.height);
            }
          });
        } catch {
          // Individual frame detection failure — just skip the frame
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, status, videoRef]);

  if (status === "error") return null;

  return (
    <>
      {/* Loading indicator */}
      {status === "loading" && active && (
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/60 text-yellow-400 text-xs font-mono animate-pulse">
          loading face model…
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
    </>
  );
}

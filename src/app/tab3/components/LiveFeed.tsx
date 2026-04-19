"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  sessionId: string | null;
  active: boolean;
  sessionStart: number;
  onFrame: (base64: string, timestamp: number) => void;
  intervalMs?: number;
}

const CAPTURE_WIDTH = 640;
const CAPTURE_HEIGHT = 480;

export default function LiveFeed({
  sessionId,
  active,
  sessionStart,
  onFrame,
  intervalMs = 2500,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onFrameRef = useRef(onFrame);
  const sessionStartRef = useRef(sessionStart);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);
  useEffect(() => {
    sessionStartRef.current = sessionStart;
  }, [sessionStart]);

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      if (captureRef.current) {
        clearInterval(captureRef.current);
        captureRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setReady(false);
    };

    if (!active || !sessionId) {
      stop();
      return stop;
    }

    setError(null);

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: CAPTURE_WIDTH }, height: { ideal: CAPTURE_HEIGHT } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {
          /* autoplay restrictions; element has autoPlay attr */
        });
        setReady(true);

        if (!canvasRef.current) {
          canvasRef.current = document.createElement("canvas");
        }

        const captureOnce = () => {
          const v = videoRef.current;
          const c = canvasRef.current;
          if (!v || !c) return;
          if (v.readyState < 2 || v.videoWidth === 0) return;

          const aspect = v.videoWidth / v.videoHeight;
          let w = CAPTURE_WIDTH;
          let h = Math.round(w / aspect);
          if (h > CAPTURE_HEIGHT) {
            h = CAPTURE_HEIGHT;
            w = Math.round(h * aspect);
          }
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(v, 0, 0, w, h);
          const dataUrl = c.toDataURL("image/jpeg", 0.7);
          const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
          const elapsed = (Date.now() - sessionStartRef.current) / 1000;
          onFrameRef.current(base64, elapsed);
        };

        captureRef.current = setInterval(captureOnce, intervalMs);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[LiveFeed] getUserMedia failed:", msg);
        setError(msg);
      }
    };

    start();

    return () => {
      cancelled = true;
      stop();
    };
  }, [active, sessionId, intervalMs]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="h-full w-full object-cover"
      />
      {active && ready && (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-red-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          Live
        </div>
      )}
      {!active && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
          Camera off. Press Start to begin a session.
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}

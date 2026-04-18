export interface VideoFrame {
  timestampSec: number;
  base64: string; // data:image/jpeg;base64,...
}

/**
 * Extracts 5–8 evenly-spaced frames from a video File.
 * Uses an off-screen <video> + <canvas> — no server needed.
 */
export async function extractFrames(file: File): Promise<VideoFrame[]> {
  const url = URL.createObjectURL(file);

  try {
    const duration = await getVideoDuration(url);

    // Pick timestamps: one near the start, one near the end, rest evenly spaced.
    // Cap between 5 and 8 frames; aim for one every ~3 s.
    const targetCount = Math.min(8, Math.max(5, Math.floor(duration / 3)));
    const interval = duration / (targetCount - 1 || 1);
    const timestamps = Array.from({ length: targetCount }, (_, i) =>
      Math.min(i * interval, duration - 0.1)
    );

    const frames: VideoFrame[] = [];
    for (const t of timestamps) {
      const base64 = await captureFrame(url, t);
      frames.push({ timestampSec: Math.round(t * 10) / 10, base64 });
    }

    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function getVideoDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => reject(new Error("Could not load video metadata"));
  });
}

function captureFrame(url: string, timeSec: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.src = url;
    video.muted = true;

    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      // Cap width at 768 px — enough for vision models, keeps base64 small
      const scale = Math.min(1, 768 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);

      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };

    video.onerror = () => reject(new Error(`Seek failed at ${timeSec}s`));

    video.onloadeddata = () => {
      video.currentTime = timeSec;
    };
  });
}

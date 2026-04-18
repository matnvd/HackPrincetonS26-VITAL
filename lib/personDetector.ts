// Browser-only module — only import from client components.

export interface PersonDetection {
  bbox: { x: number; y: number; w: number; h: number };
  cropBase64: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let detectorInstance: any = null;
let initPromise: Promise<unknown> | null = null;

async function getDetector() {
  if (detectorInstance) return detectorInstance;
  if (!initPromise) {
    initPromise = (async () => {
      const { ObjectDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      const opts = {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite",
        },
        runningMode: "IMAGE" as const,
        scoreThreshold: 0.2,
        categoryAllowlist: ["person"],
        maxResults: 3,
      };
      try {
        detectorInstance = await ObjectDetector.createFromOptions(vision, {
          ...opts, baseOptions: { ...opts.baseOptions, delegate: "GPU" },
        });
      } catch {
        detectorInstance = await ObjectDetector.createFromOptions(vision, {
          ...opts, baseOptions: { ...opts.baseOptions, delegate: "CPU" },
        });
      }
      return detectorInstance;
    })();
  }
  return initPromise;
}

export async function detectPersonsInCanvas(
  canvas: HTMLCanvasElement
): Promise<PersonDetection[]> {
  const detector = await getDetector();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = (detector as any).detect(canvas);

  const detections: PersonDetection[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const det of ((result.detections ?? []) as any[]).slice(0, 3)) {
    const bb = det.boundingBox;
    if (!bb) continue;

    const pad = 12;
    const x = Math.max(0, Math.floor(bb.originX) - pad);
    const y = Math.max(0, Math.floor(bb.originY) - pad);
    const w = Math.min(canvas.width - x, Math.ceil(bb.width) + pad * 2);
    const h = Math.min(canvas.height - y, Math.ceil(bb.height) + pad * 2);

    if (w <= 20 || h <= 20) continue;

    const crop = document.createElement("canvas");
    crop.width = w;
    crop.height = h;
    crop.getContext("2d")!.drawImage(canvas, x, y, w, h, 0, 0, w, h);

    detections.push({
      bbox: { x, y, w, h },
      cropBase64: crop.toDataURL("image/jpeg", 0.88),
    });
  }

  return detections;
}

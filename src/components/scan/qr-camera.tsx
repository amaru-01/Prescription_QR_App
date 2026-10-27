"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2, ShieldCheck, SwitchCamera } from "lucide-react";


type CameraStatus = "idle" | "starting" | "scanning" | "denied" | "unsupported" | "error";

export function QrCamera({
  onDecode,
  onFailure,
}: {
  onDecode: (raw: string) => void;
  onFailure?: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastValueRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const decoderRef = useRef<null | ((data: Uint8ClampedArray, width: number, height: number) => string | null)>(null);

  const [status, setStatus] = useState<CameraStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  useEffect(() => stop, [stop]);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context) {
        context.drawImage(video, 0, 0, width, height);
        const image = context.getImageData(0, 0, width, height);
        if (!decoderRef.current) {
          void import("jsqr").then(({ default: jsQR }) => {
            decoderRef.current = (data, width, height) =>
              jsQR(data, width, height, { inversionAttempts: "attemptBoth" })?.data ?? null;
          });
        } else {
          const decoded = decoderRef.current(image.data, image.width, image.height);
          if (decoded) {
            const now = Date.now();
            if (decoded !== lastValueRef.current.value || now - lastValueRef.current.at > 2500) {
              lastValueRef.current = { value: decoded, at: now };
              if (navigator.vibrate) navigator.vibrate(60);
              onDecode(decoded);
            }
          }
        }
      }
    }

    frameRef.current = requestAnimationFrame(tick);
  }, [onDecode]);

  const start = useCallback(
    async (mode: "environment" | "user" = facingMode) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        setMessage("This browser cannot access a camera. Use the Upload or Manual tab instead.");
        return;
      }

      setStatus("starting");
      setMessage("");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setStatus("scanning");
        frameRef.current = requestAnimationFrame(tick);
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setStatus("denied");
          setMessage(
            "Camera permission was blocked. Allow camera access in your browser settings, or upload a photo of the code.",
          );
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setStatus("error");
          setMessage("No camera was found on this device. Upload a photo or type the details instead.");
        } else {
          setStatus("error");
          const text = "The camera could not start. Check that this page is served over HTTPS.";
          setMessage(text);
          onFailure?.(text);
        }
      }
    },
    [facingMode, onFailure, tick],
  );

  const flip = useCallback(async () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    stop();
    await start(next);
  }, [facingMode, start, stop]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-line bg-[#08130f] sm:aspect-[4/3]">
        <video
          ref={videoRef}
          playsInline
          muted
          aria-label="Camera preview for QR scanning"
          className={`size-full object-cover transition-opacity ${status === "scanning" ? "opacity-100" : "opacity-0"}`}
        />
        <canvas ref={canvasRef} className="hidden" aria-hidden />

        {status !== "scanning" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white/85">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-white/10">
              {status === "starting" ? (
                <Loader2 className="size-6 animate-spin" aria-hidden />
              ) : status === "denied" || status === "error" || status === "unsupported" ? (
                <CameraOff className="size-6" aria-hidden />
              ) : (
                <Camera className="size-6" aria-hidden />
              )}
            </div>
            <p className="max-w-xs text-sm leading-relaxed">
              {status === "starting"
                ? "Starting the camera…"
                : message ||
                  "Point the camera at the prescription QR code. Everything is decoded on your device."}
            </p>
            {status !== "starting" ? (
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => void start()} className="btn btn-primary min-h-11 px-4 text-sm">
                  <Camera className="size-4" aria-hidden />
                  {status === "denied" || status === "error" ? "Try camera again" : "Start camera"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {status === "scanning" ? (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
              <div className="relative size-[68%] max-w-[280px] rounded-2xl border-2 border-white/40">
                <span className="absolute -left-0.5 -top-0.5 size-7 rounded-tl-xl border-l-4 border-t-4 border-white" />
                <span className="absolute -right-0.5 -top-0.5 size-7 rounded-tr-xl border-r-4 border-t-4 border-white" />
                <span className="absolute -bottom-0.5 -left-0.5 size-7 rounded-bl-xl border-b-4 border-l-4 border-white" />
                <span className="absolute -bottom-0.5 -right-0.5 size-7 rounded-br-xl border-b-4 border-r-4 border-white" />
                <span className="scan-sweep inset-x-2 h-0.5 rounded-full bg-brand shadow-[0_0_16px_2px_rgba(82,211,176,0.9)]" />
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-3">
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-white/90">
                <ShieldCheck className="size-3.5" aria-hidden />
                Decoding locally
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void flip()}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white/15 px-3 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/25"
                >
                  <SwitchCamera className="size-4" aria-hidden />
                  Flip
                </button>
                <button
                  type="button"
                  onClick={stop}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white/15 px-3 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/25"
                >
                  <CameraOff className="size-4" aria-hidden />
                  Stop
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <p className="text-xs leading-relaxed text-muted" role="status">
        Camera scanning needs HTTPS or localhost. If it does not start, switch to{" "}
        <span className="font-semibold text-ink">Upload</span> and pick a screenshot of the QR code.
      </p>
    </div>
  );
}

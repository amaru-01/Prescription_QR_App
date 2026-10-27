"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ImageUp, Loader2, RotateCcw } from "lucide-react";

export function QrUploader({
  onDecode,
}: {
  onDecode: (raw: string) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decodeFile = useCallback(
    async (file: File) => {
      setError(null);
      setFileName(file.name);

      if (!file.type.startsWith("image/")) {
        setError("Choose an image file (PNG, JPG, or HEIC screenshot).");
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        setError("That image is larger than 12 MB. Try a screenshot instead.");
        return;
      }

      setBusy(true);
      const url = URL.createObjectURL(file);
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });

      try {
        const bitmap = await createImageBitmap(file).catch(async () => {
          const image = new Image();
          image.src = url;
          await image.decode();
          return image as unknown as ImageBitmap;
        });

        const maxEdge = 1600;
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable in this browser.");
        context.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const { default: jsQR } = await import("jsqr");
        const detection = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth",
        });

        if (!detection?.data) {
          setError(
            "No QR code was found in that image. Make sure the code is sharp, well lit, and not cropped, then try another photo.",
          );
          return;
        }
        onDecode(detection.data);
      } catch {
        setError("We could not read that image. Try a different file or type the details manually.");
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onDecode],
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file) void decodeFile(file);
        }}
        className="relative flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-line bg-elevated/60 px-5 py-8 text-center"
      >
        {previewUrl ? (
          <div className="flex w-full items-center gap-3 text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Selected QR code preview"
              className="size-20 shrink-0 rounded-xl border border-line object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{fileName}</p>
              <p className="mt-0.5 text-xs text-muted">
                {busy ? "Looking for a QR code…" : "Decoded on this device — nothing uploaded."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setPreviewUrl(null);
                  setFileName(null);
                  setError(null);
                  inputRef.current?.click();
                }}
                className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-muted hover:text-ink"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                Choose another
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong">
              <ImageUp className="size-6" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Upload or drop a QR code photo</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Screenshots and camera photos both work. Nothing leaves your device until you save.
              </p>
            </div>
          </>
        )}

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void decodeFile(file);
          }}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="btn btn-primary min-h-12 w-full sm:w-auto"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImageUp className="size-4" aria-hidden />}
          {busy ? "Reading QR code…" : "Choose a photo"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Images,
  RefreshCw,
  ScanLine,
  Upload,
  X,
} from 'lucide-react';
import { PageItem } from '../types/pinkora';
import {
  createPageItemFromDataUrl,
  createPageItemFromFile,
} from '../services/imageProcessor';

interface CameraScannerModalProps {
  open: boolean;
  onClose: () => void;
  onFinishPages: (pages: PageItem[]) => void;
  onOpenGalleryInstead: () => void;
}

export function CameraScannerModal({
  open,
  onClose,
  onFinishPages,
  onOpenGalleryInstead,
}: CameraScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileFallbackRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [autoCrop, setAutoCrop] = useState(true);
  const [capturedPages, setCapturedPages] = useState<PageItem[]>([]);

  useEffect(() => {
    if (!open) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCapturedPages([]);
      setCameraError(null);
      return;
    }

    let cancelled = false;

    const startStream = async () => {
      setCameraError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Live camera access is unavailable in this browser. Use Upload Photo or Gallery instead.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            (err as Error)?.name === 'NotAllowedError'
              ? 'Camera permission was denied. Allow camera access or capture/pick a photo below.'
              : 'Could not start camera device. You can still upload a photo directly.';
          setCameraError(msg);
        }
      }
    };

    startStream();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open, facingMode]);

  if (!open) return null;

  const handleSnap = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || capturing) return;
    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const item = await createPageItemFromDataUrl(
        dataUrl,
        `Scan_${capturedPages.length + 1}.jpg`,
        autoCrop,
        'auto_enhance'
      );
      setCapturedPages((prev) => [...prev, item]);
    } finally {
      setCapturing(false);
    }
  };

  const handleFallbackFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setCapturing(true);
    try {
      const added: PageItem[] = [];
      for (const f of files) {
        added.push(await createPageItemFromFile(f));
      }
      setCapturedPages((prev) => [...prev, ...added]);
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Document Camera Scanner"
      className="fixed inset-0 z-50 flex flex-col bg-[#111622] text-white"
    >
      {/* Top Bar */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-[#181F2E] border-b border-white/10 pt-safe">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-sm sm:text-base font-semibold">Document Scanner</h2>
            <p className="text-xs text-white/65 tabular-nums">
              {capturedPages.length === 0
                ? 'Align document inside frame'
                : `${capturedPages.length} ${capturedPages.length === 1 ? 'page' : 'pages'} captured`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoCrop((a) => !a)}
            className={`min-h-[40px] px-3 rounded-xl text-xs font-semibold transition-colors ${
              autoCrop ? 'bg-[#2563EB] text-white' : 'bg-white/10 text-white/75'
            }`}
          >
            Auto-Crop: {autoCrop ? 'On' : 'Off'}
          </button>

          <button
            type="button"
            onClick={() =>
              setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))
            }
            aria-label="Switch camera"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Live Viewfinder or Permission Fallback */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        {cameraError ? (
          <div className="max-w-sm mx-auto p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#2563EB]/20 text-[#60A5FA] flex items-center justify-center mx-auto">
              <Camera className="w-7 h-7" />
            </div>
            <p className="text-sm text-white/85 leading-relaxed">{cameraError}</p>
            <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
              <button
                type="button"
                onClick={() => fileFallbackRef.current?.click()}
                className="min-h-[44px] px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>Capture / Upload Photo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenGalleryInstead();
                }}
                className="min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-semibold inline-flex items-center justify-center gap-2"
              >
                <Images className="w-4 h-4" />
                <span>Pick from Gallery</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
            />
            {/* Document Framing Guide */}
            <div className="pointer-events-none absolute inset-8 sm:inset-14 border-2 border-dashed border-white/55 rounded-2xl flex items-end justify-center pb-3">
              <span className="px-3 py-1 rounded-lg bg-black/55 text-xs text-white/90 inline-flex items-center gap-1.5">
                <ScanLine className="w-3.5 h-3.5 text-[#60A5FA]" />
                Keep page corners clear for edge detection
              </span>
            </div>
          </>
        )}

        <input
          ref={fileFallbackRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={handleFallbackFiles}
        />
      </div>

      {/* Bottom Shutter & Captured Strip */}
      <footer className="bg-[#181F2E] border-t border-white/10 px-4 py-4 pb-safe">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-4">
          {/* Thumbnail Stack / Gallery Shortcut */}
          <div className="w-24 flex items-center">
            {capturedPages.length > 0 ? (
              <div className="flex items-center gap-2">
                <img
                  src={capturedPages[capturedPages.length - 1].processedDataUrl}
                  alt="Last scanned page"
                  className="w-11 h-14 object-cover rounded-lg border border-white/30 bg-white"
                />
                <span className="text-xs font-mono tabular-nums text-white/80">
                  {capturedPages.length}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileFallbackRef.current?.click()}
                className="min-h-[44px] px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Images className="w-4 h-4" />
                <span>Import</span>
              </button>
            )}
          </div>

          {/* Shutter Button */}
          <button
            type="button"
            disabled={Boolean(cameraError) || capturing}
            onClick={handleSnap}
            aria-label="Capture document page"
            className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-35 active:scale-95 transition-transform"
          >
            <span className="w-12 h-12 rounded-full bg-[#2563EB] block" />
          </button>

          {/* Finish / Continue */}
          <div className="w-24 flex justify-end">
            <button
              type="button"
              disabled={capturedPages.length === 0}
              onClick={() => onFinishPages(capturedPages)}
              className="min-h-[44px] px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-35 text-sm font-semibold inline-flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Done</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

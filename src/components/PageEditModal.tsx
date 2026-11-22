import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Crop,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  Sparkles,
  X,
} from 'lucide-react';
import {
  FilterPreset,
  PageItem,
  QuadPoints,
  ResizePreset,
} from '../types/pinkora';
import {
  detectDocumentQuad,
  FILTER_OPTIONS,
  FULL_QUAD,
  renderProcessedPage,
} from '../services/imageProcessor';

interface PageEditModalProps {
  page: PageItem | null;
  pageIndex?: number;
  totalPages?: number;
  onClose: () => void;
  onSave: (updated: PageItem) => void;
  onApplyFilterToAll?: (filter: FilterPreset) => void;
}

type EditTab = 'crop' | 'filter' | 'resize';

export function PageEditModal({
  page,
  pageIndex,
  totalPages,
  onClose,
  onSave,
  onApplyFilterToAll,
}: PageEditModalProps) {
  const [tab, setTab] = useState<EditTab>('crop');
  const [quad, setQuad] = useState<QuadPoints>([...FULL_QUAD] as QuadPoints);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [filter, setFilter] = useState<FilterPreset>('original');
  const [resizePreset, setResizePreset] = useState<ResizePreset>('hd');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewDims, setPreviewDims] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const [activeHandle, setActiveHandle] = useState<number | null>(null);

  const cropBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!page) return;
    setTab('crop');
    setQuad(page.cropQuad.map((p) => ({ ...p })) as QuadPoints);
    setRotation(page.rotation);
    setFilter(page.filter);
    setResizePreset(page.resizePreset);
    setPreviewUrl(page.processedDataUrl);
    setPreviewDims({ w: page.processedWidth, h: page.processedHeight });
  }, [page]);

  // Update preview whenever filter, rotation, resize, or tab switches away from crop
  useEffect(() => {
    if (!page || tab === 'crop') return;
    let alive = true;
    renderProcessedPage(page.originalDataUrl, quad, rotation, filter, resizePreset).then(
      (res) => {
        if (!alive) return;
        setPreviewUrl(res.dataUrl);
        setPreviewDims({ w: res.width, h: res.height });
      }
    );
    return () => {
      alive = false;
    };
  }, [page, quad, rotation, filter, resizePreset, tab]);

  if (!page) return null;

  const updateCornerFromPointer = (clientX: number, clientY: number, idx: number) => {
    const el = cropBoxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = Math.min(0.98, Math.max(0.02, (clientX - rect.left) / rect.width));
    const ny = Math.min(0.98, Math.max(0.02, (clientY - rect.top) / rect.height));
    setQuad((prev) => {
      const next = prev.map((pt) => ({ ...pt })) as QuadPoints;
      next[idx] = { x: nx, y: ny };
      return next;
    });
  };

  const handleAutoDetect = async () => {
    setBusy(true);
    try {
      const detected = await detectDocumentQuad(page.originalDataUrl);
      setQuad(detected);
    } finally {
      setBusy(false);
    }
  };

  const handleApplySave = async () => {
    setBusy(true);
    try {
      const res = await renderProcessedPage(
        page.originalDataUrl,
        quad,
        rotation,
        filter,
        resizePreset
      );
      onSave({
        ...page,
        cropQuad: quad,
        rotation,
        filter,
        resizePreset,
        processedDataUrl: res.dataUrl,
        processedWidth: res.width,
        processedHeight: res.height,
      });
    } finally {
      setBusy(false);
    }
  };

  const quadSvgPoints = quad.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit Scanned Page"
      className="fixed inset-0 z-50 flex flex-col bg-[#111622] text-white"
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-[#181F2E] border-b border-white/10 pt-safe">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Discard edits"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-sm sm:text-base font-semibold">
              {typeof pageIndex === 'number' && typeof totalPages === 'number'
                ? `Edit Page ${pageIndex + 1} of ${totalPages}`
                : 'Edit Page'}
            </h2>
            <p className="text-xs text-white/65 tabular-nums">
              {previewDims.w} × {previewDims.h} px
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={handleApplySave}
          className="min-h-[44px] px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-sm font-semibold inline-flex items-center gap-1.5"
        >
          <Check className="w-4 h-4" />
          <span>{busy ? 'Applying...' : 'Done'}</span>
        </button>
      </header>

      {/* Main Preview Canvas */}
      <div className="flex-1 overflow-hidden flex items-center justify-center p-4 sm:p-6 select-none">
        {tab === 'crop' ? (
          <div className="relative max-w-full max-h-full flex items-center justify-center">
            <div
              ref={cropBoxRef}
              onPointerMove={(e) => {
                if (activeHandle !== null) {
                  updateCornerFromPointer(e.clientX, e.clientY, activeHandle);
                }
              }}
              onPointerUp={() => setActiveHandle(null)}
              onPointerLeave={() => setActiveHandle(null)}
              className="relative inline-block touch-none"
            >
              <img
                src={page.originalDataUrl}
                alt="Document crop canvas"
                draggable={false}
                className="max-h-[58vh] sm:max-h-[64vh] max-w-full object-contain rounded-lg block"
              />

              {/* SVG Perspective Quad Overlay */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <polygon
                  points={quadSvgPoints}
                  fill="rgba(37, 99, 235, 0.16)"
                  stroke="#3B82F6"
                  strokeWidth="0.9"
                />
              </svg>

              {/* 4 Corner Drag Handles */}
              {quad.map((pt, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Drag corner ${idx + 1}`}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setActiveHandle(idx);
                  }}
                  style={{
                    left: `${pt.x * 100}%`,
                    top: `${pt.y * 100}%`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
                >
                  <span className="w-5 h-5 rounded-full bg-[#2563EB] border-2 border-white shadow-md" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-full max-h-full flex items-center justify-center">
            <img
              src={previewUrl || page.processedDataUrl}
              alt="Edited page preview"
              className="max-h-[58vh] sm:max-h-[64vh] max-w-full object-contain rounded-lg shadow-2xl bg-white"
            />
          </div>
        )}
      </div>

      {/* Bottom Tool Controls */}
      <footer className="bg-[#181F2E] border-t border-white/10 p-4 pb-safe space-y-3">
        {/* Contextual Panel */}
        {tab === 'crop' && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleAutoDetect}
              className="min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs sm:text-sm font-medium"
            >
              Auto Detect Edges
            </button>
            <button
              type="button"
              onClick={() => setQuad([...FULL_QUAD] as QuadPoints)}
              className="min-h-[44px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5"
            >
              <Maximize2 className="w-4 h-4" />
              <span>Full Frame</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setRotation((r) => (((r - 90 + 360) % 360) as 0 | 90 | 180 | 270))
              }
              className="min-h-[44px] px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>-90°</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setRotation((r) => (((r + 90) % 360) as 0 | 90 | 180 | 270))
              }
              className="min-h-[44px] px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5"
            >
              <RotateCw className="w-4 h-4" />
              <span>+90°</span>
            </button>
          </div>
        )}

        {tab === 'filter' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {FILTER_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`min-h-[44px] px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                    filter === f.id
                      ? 'bg-[#2563EB] text-white'
                      : 'bg-white/10 hover:bg-white/15 text-white/85'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {typeof totalPages === 'number' && totalPages > 1 && onApplyFilterToAll && (
              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onApplyFilterToAll(filter)}
                  className="min-h-[40px] px-4 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold text-white transition-colors"
                >
                  Apply &ldquo;{FILTER_OPTIONS.find((x) => x.id === filter)?.label}&rdquo; to All {totalPages} Pages
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'resize' && (
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {(
              [
                { id: 'original', label: 'Max (2200px)' },
                { id: 'hd', label: 'HD (1600px)' },
                { id: 'medium', label: 'Medium (1200px)' },
                { id: 'compact', label: 'Compact (850px)' },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setResizePreset(r.id)}
                className={`min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                  resizePreset === r.id
                    ? 'bg-[#2563EB] text-white'
                    : 'bg-white/10 hover:bg-white/15 text-white/85'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/* Mode Switcher Tabs */}
        <div className="flex items-center justify-center gap-2 pt-1 border-t border-white/10">
          <button
            type="button"
            onClick={() => setTab('crop')}
            className={`min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 ${
              tab === 'crop' ? 'bg-white text-[#1E2430]' : 'text-white/75 hover:text-white'
            }`}
          >
            <Crop className="w-4 h-4" />
            <span>Crop &amp; Rotate</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('filter')}
            className={`min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 ${
              tab === 'filter' ? 'bg-white text-[#1E2430]' : 'text-white/75 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Filters</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('resize')}
            className={`min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 ${
              tab === 'resize' ? 'bg-white text-[#1E2430]' : 'text-white/75 hover:text-white'
            }`}
          >
            <Minimize2 className="w-4 h-4" />
            <span>Resize</span>
          </button>
        </div>
      </footer>
    </div>
  );
}

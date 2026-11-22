import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Lock,
  Share2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { PdfDocumentRecord } from '../types/pinkora';
import {
  openPdfProxy,
  renderPdfPageToCanvas,
  sharePdfDocument,
} from '../services/pdfEngine';
import { formatBytes } from '../services/storage';

interface PdfViewerModalProps {
  documentRecord: PdfDocumentRecord | null;
  onClose: () => void;
  onRequestSaveCopy: (doc: PdfDocumentRecord) => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function PdfViewerModal({
  documentRecord,
  onClose,
  onRequestSaveCopy,
  onNotify,
}: PdfViewerModalProps) {
  const [proxy, setProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(1.1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const loadWithPassword = async (
    record: PdfDocumentRecord,
    pw?: string,
    cancelledRef?: { current: boolean }
  ) => {
    setLoading(true);
    setErrorMsg(null);
    setPasswordError('');
    try {
      const p = await openPdfProxy(record.pdfBytes, pw);
      if (cancelledRef?.current) {
        await p.loadingTask.destroy();
        return;
      }
      setProxy(p);
      setNumPages(p.numPages);
      setNeedsPassword(false);
    } catch (err) {
      if (cancelledRef?.current) return;
      const name = (err as { name?: string })?.name;
      const code = (err as { code?: number })?.code;
      if (name === 'PasswordException' || code === 1 || code === 2) {
        setNeedsPassword(true);
        setPasswordError(code === 2 ? 'Incorrect password. Please try again.' : '');
      } else {
        setErrorMsg((err as Error)?.message || 'Unable to render this PDF.');
      }
    } finally {
      if (!cancelledRef?.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!documentRecord) return;
    const cancelledRef = { current: false };
    let activeProxy: pdfjsLib.PDFDocumentProxy | null = null;

    setPageNumber(1);
    setScale(window.innerWidth < 640 ? 0.85 : 1.15);
    setNeedsPassword(false);
    setPasswordInput('');
    setPasswordError('');

    openPdfProxy(documentRecord.pdfBytes)
      .then((p) => {
        if (cancelledRef.current) {
          p.loadingTask.destroy();
          return;
        }
        activeProxy = p;
        setProxy(p);
        setNumPages(p.numPages);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelledRef.current) return;
        const name = (err as { name?: string })?.name;
        const code = (err as { code?: number })?.code;
        if (name === 'PasswordException' || code === 1 || code === 2) {
          setNeedsPassword(true);
        } else {
          setErrorMsg((err as Error)?.message || 'Unable to render this PDF.');
        }
        setLoading(false);
      });

    setLoading(true);
    setErrorMsg(null);

    return () => {
      cancelledRef.current = true;
      activeProxy?.loadingTask.destroy();
      setProxy(null);
    };
  }, [documentRecord]);

  useEffect(() => {
    if (!proxy || !canvasRef.current) return;
    let active = true;
    renderPdfPageToCanvas(proxy, pageNumber, canvasRef.current, scale).catch((err) => {
      if (active) setErrorMsg((err as Error)?.message || 'Page render failed.');
    });
    return () => {
      active = false;
    };
  }, [proxy, pageNumber, scale]);

  if (!documentRecord) return null;

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) {
      setPasswordError('Enter the PDF password.');
      return;
    }
    await loadWithPassword(documentRecord, passwordInput.trim());
  };

  const handleShare = async () => {
    try {
      const outcome = await sharePdfDocument(documentRecord.pdfBytes, documentRecord.name);
      onNotify(
        'success',
        outcome === 'shared'
          ? 'Shared PDF document.'
          : 'Share sheet unavailable here — downloaded PDF copy instead.'
      );
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        onNotify('error', (err as Error)?.message || 'Failed to share PDF.');
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Viewing ${documentRecord.name}`}
      className="fixed inset-0 z-50 flex flex-col bg-[#111622] text-white"
    >
      {/* Top Bar */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-[#181F2E] border-b border-white/10 pt-safe">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close PDF viewer"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold truncate">
              {documentRecord.name}
            </h2>
            <p className="text-xs text-white/65 tabular-nums">
              Page {pageNumber} of {numPages} · {formatBytes(documentRecord.sizeBytes)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onRequestSaveCopy(documentRecord)}
            aria-label="Save PDF copy"
            className="min-h-[44px] px-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Save Copy</span>
          </button>
          <button
            type="button"
            onClick={handleShare}
            aria-label="Share PDF"
            className="min-h-[44px] px-3.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">Share</span>
          </button>
        </div>
      </header>

      {/* Canvas Viewport */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4 sm:p-6">
        {loading ? (
          <div className="my-auto text-sm text-white/75">Opening PDF document...</div>
        ) : needsPassword ? (
          <form
            onSubmit={handleUnlockSubmit}
            className="my-auto w-full max-w-sm rounded-3xl bg-[#181F2E] border border-white/10 p-6 space-y-4 text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#2563EB]/20 text-[#60A5FA] flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold">Password Required</h3>
              <p className="mt-1 text-xs text-white/65">
                Enter the password to unlock and view this encrypted PDF.
              </p>
            </div>
            <div className="flex items-center rounded-xl border border-white/15 bg-[#111622] px-3 focus-within:border-[#2563EB]">
              <input
                type={showPw ? 'text' : 'password'}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter PDF password"
                autoFocus
                className="w-full min-h-[44px] bg-transparent text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="p-2 text-white/60 hover:text-white"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {passwordError && (
              <p className="text-xs font-medium text-[#FCA5A5]">{passwordError}</p>
            )}
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-sm font-semibold"
            >
              Unlock PDF
            </button>
          </form>
        ) : errorMsg ? (
          <div className="my-auto max-w-sm text-center space-y-2">
            <p className="text-sm font-semibold text-[#FCA5A5]">{errorMsg}</p>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl bg-white/10 text-sm"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="rounded-lg shadow-2xl bg-white overflow-hidden">
            <canvas ref={canvasRef} className="block" />
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      {!needsPassword && !errorMsg && (
        <footer className="flex items-center justify-center gap-2 sm:gap-4 px-4 py-3 bg-[#181F2E] border-t border-white/10 pb-safe">
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-35"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <span className="text-xs sm:text-sm font-mono tabular-nums px-2">
            {pageNumber} / {numPages}
          </span>

          <button
            type="button"
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            aria-label="Next page"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-35"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="w-px h-6 bg-white/15 mx-1" />

          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.5, Number((s - 0.15).toFixed(2))))}
            aria-label="Zoom out"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="text-xs font-mono tabular-nums w-12 text-center">
            {Math.round(scale * 100)}%
          </span>

          <button
            type="button"
            onClick={() => setScale((s) => Math.min(2.4, Number((s + 0.15).toFixed(2))))}
            aria-label="Zoom in"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </footer>
      )}
    </div>
  );
}

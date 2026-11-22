import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Copy,
  Crop,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Home,
  Images,
  Lock,
  Minimize2,
  Pencil,
  RotateCcw,
  RotateCw,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  AppSettings,
  FilterPreset,
  ImageFitMode,
  PageItem,
  PageOrientation,
  PageSizeOption,
  PdfDocumentRecord,
  QualityPreset,
} from '../types/pinkora';
import { FILTER_OPTIONS, renderProcessedPage } from '../services/imageProcessor';
import { createPdfFromPages, savePdfToDevice, sharePdfDocument } from '../services/pdfEngine';
import { ensureUniqueFilename, formatBytes, generateDefaultFilename, sanitizeFilename } from '../services/storage';
import { ConfirmModal } from './PinkoraBrand';
import { PageEditModal } from './PageEditModal';

interface DocumentEditorWorkspaceProps {
  pages: PageItem[];
  setPages: React.Dispatch<React.SetStateAction<PageItem[]>>;
  settings: AppSettings;
  existingFilenames: string[];
  onAddFromGallery: () => void;
  onAddFromCamera: () => void;
  onSaveDocument: (doc: PdfDocumentRecord) => Promise<void>;
  onOpenViewer: (doc: PdfDocumentRecord) => void;
  onSaveCopy?: (doc: PdfDocumentRecord) => void;
  onRenameSavedDoc: (doc: PdfDocumentRecord) => void;
  onExitToHome: () => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function DocumentEditorWorkspace({
  pages,
  setPages,
  settings,
  existingFilenames,
  onAddFromGallery,
  onAddFromCamera,
  onSaveDocument,
  onOpenViewer,
  onSaveCopy,
  onRenameSavedDoc,
  onExitToHome,
  onNotify,
}: DocumentEditorWorkspaceProps) {
  const [selectedPageId, setSelectedPageId] = useState<string>(pages[0]?.id ?? '');
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // PDF Export Settings
  const [filename, setFilename] = useState(() =>
    generateDefaultFilename(settings.filenamePrefix, existingFilenames)
  );
  const [pageSize, setPageSize] = useState<PageSizeOption>(settings.defaultPageSize);
  const [orientation, setOrientation] = useState<PageOrientation>(settings.defaultOrientation);
  const [fitMode, setFitMode] = useState<ImageFitMode>(settings.defaultFitMode);
  const [quality, setQuality] = useState<QualityPreset>(settings.defaultQuality);
  const [addPageNumbers, setAddPageNumbers] = useState(false);
  const [watermarkText, setWatermarkText] = useState('');
  const [protectPdf, setProtectPdf] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [applyingFilter, setApplyingFilter] = useState(false);

  // Generation State
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const abortControllerRef = useRef<AbortController | null>(null);
  const [createdDoc, setCreatedDoc] = useState<PdfDocumentRecord | null>(null);

  useEffect(() => {
    if (pages.length > 0 && !pages.some((p) => p.id === selectedPageId)) {
      setSelectedPageId(pages[0].id);
    }
  }, [pages, selectedPageId]);

  const activePage = pages.find((p) => p.id === selectedPageId) ?? pages[0] ?? null;
  const activePageIndex = activePage ? pages.findIndex((p) => p.id === activePage.id) : -1;
  const editingPage = pages.find((p) => p.id === editingPageId) ?? null;
  const editingIndex = editingPage ? pages.findIndex((p) => p.id === editingPage.id) : -1;

  const handleQuickRotate = async (page: PageItem, delta: 90 | -90) => {
    const nextRot = (((page.rotation + delta) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
    const rendered = await renderProcessedPage(
      page.originalDataUrl,
      page.cropQuad,
      nextRot,
      page.filter,
      page.resizePreset
    );
    setPages((prev) =>
      prev.map((item) =>
        item.id === page.id
          ? {
              ...item,
              rotation: nextRot,
              processedDataUrl: rendered.dataUrl,
              processedWidth: rendered.width,
              processedHeight: rendered.height,
            }
          : item
      )
    );
  };

  const handleDuplicate = (page: PageItem, idx: number) => {
    const copy: PageItem = {
      ...page,
      id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: `${page.name} (Copy)`,
    };
    setPages((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    setSelectedPageId(copy.id);
    onNotify('info', 'Page duplicated.');
  };

  const handleMove = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= pages.length || fromIdx === toIdx) return;
    setPages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const handleConfirmDeletePage = () => {
    if (!deleteTargetId) return;
    setPages((prev) => prev.filter((p) => p.id !== deleteTargetId));
    setDeleteTargetId(null);
    onNotify('info', 'Page removed.');
  };

  const handleQuickFilter = async (page: PageItem, nextFilter: FilterPreset) => {
    setApplyingFilter(true);
    try {
      const rendered = await renderProcessedPage(
        page.originalDataUrl,
        page.cropQuad,
        page.rotation,
        nextFilter,
        page.resizePreset
      );
      setPages((prev) =>
        prev.map((item) =>
          item.id === page.id
            ? {
                ...item,
                filter: nextFilter,
                processedDataUrl: rendered.dataUrl,
                processedWidth: rendered.width,
                processedHeight: rendered.height,
              }
            : item
        )
      );
    } finally {
      setApplyingFilter(false);
    }
  };

  const handleApplyFilterToAll = async (nextFilter: FilterPreset) => {
    if (pages.length === 0) return;
    setApplyingFilter(true);
    try {
      const updated = await Promise.all(
        pages.map(async (item) => {
          const rendered = await renderProcessedPage(
            item.originalDataUrl,
            item.cropQuad,
            item.rotation,
            nextFilter,
            item.resizePreset
          );
          return {
            ...item,
            filter: nextFilter,
            processedDataUrl: rendered.dataUrl,
            processedWidth: rendered.width,
            processedHeight: rendered.height,
          };
        })
      );
      setPages(updated);
      const label = FILTER_OPTIONS.find((f) => f.id === nextFilter)?.label ?? nextFilter;
      onNotify('success', `Applied "${label}" filter to all ${updated.length} pages.`);
    } finally {
      setApplyingFilter(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (pages.length === 0) {
      onNotify('error', 'Add at least one image or scanned page first.');
      return;
    }

    if (protectPdf && pdfPassword.trim().length === 0) {
      onNotify('error', 'Enter a password or turn off password protection.');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setGenerating(true);
    setProgress({ current: 0, total: pages.length });

    try {
      const cleanName = ensureUniqueFilename(
        sanitizeFilename(filename),
        existingFilenames
      );

      const result = await createPdfFromPages(
        pages,
        {
          filename: cleanName,
          pageSize,
          orientation,
          fitMode,
          quality,
          password: protectPdf ? pdfPassword.trim() : undefined,
          addPageNumbers,
          watermarkText: watermarkText.trim() || undefined,
        },
        (current, total) => setProgress({ current, total }),
        controller.signal
      );

      const now = Date.now();
      const record: PdfDocumentRecord = {
        id: `doc_${now}_${Math.random().toString(36).slice(2, 8)}`,
        name: cleanName,
        createdAt: now,
        updatedAt: now,
        pageCount: result.pageCount,
        sizeBytes: result.pdfBytes.byteLength,
        thumbnailDataUrl: result.thumbnailDataUrl,
        pdfBytes: result.pdfBytes,
        isProtected: result.isProtected,
      };

      await onSaveDocument(record);
      setCreatedDoc(record);
      onNotify('success', `Saved "${cleanName}" (${formatBytes(record.sizeBytes)})`);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        onNotify('info', 'PDF generation cancelled.');
      } else {
        onNotify('error', (err as Error)?.message || 'Failed to generate PDF.');
      }
    } finally {
      setGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // Completion Screen
  if (createdDoc) {
    return (
      <div className="max-w-xl mx-auto py-6 sm:py-10 space-y-6">
        <div className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-6 sm:p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-[#1FA971]/15 text-[#1FA971] flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-extrabold text-[#1E2430] dark:text-[#F4F7FC]">
              PDF Ready
            </h2>
            <p className="text-sm font-semibold text-[#1E2430] dark:text-[#F4F7FC] break-all">
              {createdDoc.name}
            </p>
            <p className="text-xs sm:text-sm text-[#647084] dark:text-[#A8B3C7] tabular-nums inline-flex items-center justify-center gap-1.5">
              <span>
                {createdDoc.pageCount} {createdDoc.pageCount === 1 ? 'page' : 'pages'} ·{' '}
                {formatBytes(createdDoc.sizeBytes)}
              </span>
              {createdDoc.isProtected && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-[#2563EB] dark:text-[#60A5FA] font-semibold">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Locked</span>
                  </span>
                </>
              )}
            </p>
          </div>

          {createdDoc.thumbnailDataUrl && (
            <div className="w-36 h-48 mx-auto rounded-2xl overflow-hidden border border-[#D9E4F8] dark:border-[#27354F] shadow-sm bg-white">
              <img
                src={createdDoc.thumbnailDataUrl}
                alt={`Preview of ${createdDoc.name}`}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenViewer(createdDoc)}
              className="min-h-[48px] px-5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>Open PDF</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await sharePdfDocument(createdDoc.pdfBytes, createdDoc.name);
                  onNotify(
                    'success',
                    res === 'shared'
                      ? 'Shared PDF document.'
                      : 'Browser share unavailable here — downloaded PDF copy instead.'
                  );
                } catch (err) {
                  if ((err as Error)?.name !== 'AbortError') {
                    onNotify('error', 'Could not share PDF.');
                  }
                }
              }}
              className="min-h-[48px] px-5 rounded-2xl bg-[#E0ECFF] dark:bg-[#1D2A44] hover:bg-[#C7DBFE] dark:hover:bg-[#26385B] text-[#1D4ED8] dark:text-[#60A5FA] text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span>Share PDF</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                if (onSaveCopy) {
                  onSaveCopy(createdDoc);
                  return;
                }
                try {
                  await savePdfToDevice(createdDoc.pdfBytes, createdDoc.name);
                  onNotify('success', 'Saved PDF copy to your device.');
                } catch (err) {
                  if ((err as Error)?.name !== 'AbortError') {
                    onNotify('error', 'Could not export PDF file.');
                  }
                }
              }}
              className="min-h-[46px] px-5 rounded-2xl border border-[#CFDCF4] dark:border-[#27354F] text-sm font-semibold text-[#1E2430] dark:text-[#F4F7FC] hover:border-[#2563EB] inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Save Copy</span>
            </button>
            <button
              type="button"
              onClick={() => onRenameSavedDoc(createdDoc)}
              className="min-h-[46px] px-5 rounded-2xl border border-[#CFDCF4] dark:border-[#27354F] text-sm font-semibold text-[#1E2430] dark:text-[#F4F7FC] hover:border-[#2563EB] inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              <span>Rename</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onExitToHome}
            className="min-h-[44px] px-4 text-sm font-semibold text-[#647084] dark:text-[#A8B3C7] hover:text-[#2563EB] inline-flex items-center gap-2 transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>Return Home</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (pages.length > 0) {
                setConfirmDiscardOpen(true);
              } else {
                onExitToHome();
              }
            }}
            aria-label="Back to Home"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] hover:border-[#2563EB] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-[#1E2430] dark:text-[#F4F7FC]">
              Document Studio
            </h1>
            <p className="text-xs sm:text-sm text-[#647084] dark:text-[#A8B3C7] tabular-nums">
              {pages.length} {pages.length === 1 ? 'page' : 'pages'} ready
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAddFromGallery}
            className="min-h-[44px] px-3.5 rounded-2xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] hover:border-[#2563EB] text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Images className="w-4 h-4 text-[#2563EB]" />
            <span>Add Photos</span>
          </button>
          <button
            type="button"
            onClick={onAddFromCamera}
            className="min-h-[44px] px-3.5 rounded-2xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] hover:border-[#2563EB] text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Camera className="w-4 h-4 text-[#2563EB]" />
            <span>Scan More</span>
          </button>
        </div>
      </div>

      {pages.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-8 text-center space-y-4">
          <h2 className="text-lg font-bold">No pages in workspace</h2>
          <p className="text-sm text-[#647084] dark:text-[#A8B3C7]">
            Add photos from your gallery or scan physical documents with your camera.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onAddFromGallery}
              className="min-h-[48px] px-5 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              <Images className="w-4 h-4" />
              <span>Select Gallery Images</span>
            </button>
            <button
              type="button"
              onClick={onAddFromCamera}
              className="min-h-[48px] px-5 rounded-2xl bg-[#E0ECFF] dark:bg-[#1D2A44] text-[#1D4ED8] dark:text-[#60A5FA] text-sm font-semibold inline-flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              <span>Open Camera Scanner</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left / Top: Large Fitted Active Page Preview + Editing Tools */}
          <div className="lg:col-span-7 space-y-4">
            {activePage && (
              <div className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#D9E4F8] dark:border-[#27354F] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-[#1E2430] dark:text-[#F4F7FC] tabular-nums">
                      Page {activePageIndex + 1} of {pages.length}
                    </span>
                    <span className="ml-2 text-xs text-[#647084] dark:text-[#A8B3C7] tabular-nums">
                      {activePage.processedWidth} × {activePage.processedHeight} px
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingPageId(activePage.id)}
                    className="min-h-[40px] px-3.5 rounded-xl bg-[#E0ECFF] dark:bg-[#1D2A44] hover:bg-[#C7DBFE] text-[#1D4ED8] dark:text-[#60A5FA] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Full Editor</span>
                  </button>
                </div>

                {/* Large Fitted Preview Container */}
                <div className="bg-[#111622] p-4 sm:p-6 flex items-center justify-center h-[340px] sm:h-[440px]">
                  <img
                    src={activePage.processedDataUrl}
                    alt={`Preview of page ${activePageIndex + 1}`}
                    onClick={() => setEditingPageId(activePage.id)}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-xl bg-white cursor-pointer"
                  />
                </div>

                {/* Editing Tools Arranged Cleanly Below Preview */}
                <div className="p-3 sm:p-4 bg-[#F8FAFF] dark:bg-[#151B28] border-t border-[#D9E4F8] dark:border-[#27354F]">
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingPageId(activePage.id)}
                      className="min-h-[52px] rounded-xl bg-white dark:bg-[#1E2738] border border-[#D9E4F8] dark:border-[#2A3954] hover:border-[#2563EB] flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors"
                    >
                      <Crop className="w-4 h-4 text-[#2563EB]" />
                      <span>Crop</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingPageId(activePage.id)}
                      className="min-h-[52px] rounded-xl bg-white dark:bg-[#1E2738] border border-[#D9E4F8] dark:border-[#2A3954] hover:border-[#2563EB] flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors"
                    >
                      <Sparkles className="w-4 h-4 text-[#2563EB]" />
                      <span>Filters</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickRotate(activePage, -90)}
                      className="min-h-[52px] rounded-xl bg-white dark:bg-[#1E2738] border border-[#D9E4F8] dark:border-[#2A3954] hover:border-[#2563EB] flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 text-[#1E2430] dark:text-white" />
                      <span>Left</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickRotate(activePage, 90)}
                      className="min-h-[52px] rounded-xl bg-white dark:bg-[#1E2738] border border-[#D9E4F8] dark:border-[#2A3954] hover:border-[#2563EB] flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors"
                    >
                      <RotateCw className="w-4 h-4 text-[#1E2430] dark:text-white" />
                      <span>Right</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingPageId(activePage.id)}
                      className="min-h-[52px] rounded-xl bg-white dark:bg-[#1E2738] border border-[#D9E4F8] dark:border-[#2A3954] hover:border-[#2563EB] flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors"
                    >
                      <Minimize2 className="w-4 h-4 text-[#2563EB]" />
                      <span>Resize</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDuplicate(activePage, activePageIndex)}
                      className="min-h-[52px] rounded-xl bg-white dark:bg-[#1E2738] border border-[#D9E4F8] dark:border-[#2A3954] hover:border-[#2563EB] flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors"
                    >
                      <Copy className="w-4 h-4 text-[#647084] dark:text-[#A8B3C7]" />
                      <span>Duplicate</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteTargetId(activePage.id)}
                      className="min-h-[52px] rounded-xl bg-white dark:bg-[#1E2738] border border-[#D9E4F8] dark:border-[#2A3954] hover:border-[#D9364F] flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-[#D9364F] transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </button>
                  </div>

                  {/* Quick Document Filters Strip */}
                  <div className="mt-3 pt-3 border-t border-[#D9E4F8] dark:border-[#27354F] space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[#647084] dark:text-[#A8B3C7]">
                        Quick Page Filters
                      </span>
                      {pages.length > 1 && (
                        <button
                          type="button"
                          disabled={applyingFilter}
                          onClick={() => handleApplyFilterToAll(activePage.filter)}
                          className="text-[11px] font-semibold text-[#2563EB] hover:underline disabled:opacity-50"
                        >
                          Apply &ldquo;
                          {FILTER_OPTIONS.find((f) => f.id === activePage.filter)?.label}
                          &rdquo; to all
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {FILTER_OPTIONS.map((f) => {
                        const selected = activePage.filter === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            disabled={applyingFilter}
                            onClick={() => handleQuickFilter(activePage, f.id)}
                            className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                              selected
                                ? 'bg-[#2563EB] text-white'
                                : 'bg-white dark:bg-[#1E2738] border border-[#D9E4F8] dark:border-[#2A3954] text-[#1E2430] dark:text-[#F4F7FC] hover:border-[#2563EB]'
                            }`}
                          >
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Page Order Grid */}
            <div className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#1E2430] dark:text-[#F4F7FC]">
                  Pages Order
                </h2>
                <span className="text-xs text-[#647084] dark:text-[#A8B3C7]">
                  Drag or use arrows to reorder
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {pages.map((p, idx) => {
                  const isSelected = p.id === activePage?.id;
                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={() => setDraggedIdx(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (draggedIdx !== null) {
                          handleMove(draggedIdx, idx);
                          setDraggedIdx(null);
                        }
                      }}
                      className={`rounded-2xl border p-2 transition-all bg-[#F8FAFF] dark:bg-[#141A26] ${
                        isSelected
                          ? 'border-[#2563EB] ring-2 ring-[#2563EB]/20'
                          : 'border-[#D9E4F8] dark:border-[#27354F]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedPageId(p.id)}
                        className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-white flex items-center justify-center"
                      >
                        <img
                          src={p.processedDataUrl}
                          alt={`Page ${idx + 1}`}
                          className="w-full h-full object-contain"
                        />
                      </button>

                      <div className="mt-2 flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-[#1E2430] dark:text-[#F4F7FC] tabular-nums pl-1">
                          {idx + 1}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleMove(idx, idx - 1)}
                            disabled={idx === 0}
                            aria-label={`Move page ${idx + 1} earlier`}
                            className="p-1.5 rounded-lg hover:bg-[#E0ECFF] dark:hover:bg-[#1D2A44] disabled:opacity-30 transition-colors"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMove(idx, idx + 1)}
                            disabled={idx === pages.length - 1}
                            aria-label={`Move page ${idx + 1} later`}
                            className="p-1.5 rounded-lg hover:bg-[#E0ECFF] dark:hover:bg-[#1D2A44] disabled:opacity-30 transition-colors"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right / Bottom: PDF Output Settings & Create CTA */}
          <div className="lg:col-span-5 rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-5 sm:p-6 space-y-5">
            <h2 className="text-base sm:text-lg font-bold text-[#1E2430] dark:text-[#F4F7FC]">
              PDF Export Settings
            </h2>

            {/* Filename */}
            <div className="space-y-1.5">
              <label
                htmlFor="pdf-filename-input"
                className="block text-xs font-semibold text-[#647084] dark:text-[#A8B3C7]"
              >
                File Name
              </label>
              <div className="flex items-center rounded-xl border border-[#CFDCF4] dark:border-[#27354F] bg-[#F8FAFF] dark:bg-[#111622] px-3 focus-within:border-[#2563EB]">
                <input
                  id="pdf-filename-input"
                  type="text"
                  value={filename.replace(/\.pdf$/i, '')}
                  onChange={(e) => setFilename(e.target.value)}
                  maxLength={90}
                  className="w-full min-h-[44px] bg-transparent text-sm font-medium outline-none"
                />
                <span className="text-xs font-mono text-[#647084] pl-2 shrink-0">.pdf</span>
              </div>
            </div>

            {/* Page Size */}
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-[#647084] dark:text-[#A8B3C7]">
                Page Size
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'a4', label: 'A4' },
                    { id: 'letter', label: 'Letter' },
                    { id: 'original', label: 'Original' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPageSize(opt.id)}
                    className={`min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                      pageSize === opt.id
                        ? 'bg-[#2563EB] text-white'
                        : 'bg-[#F3F7FF] dark:bg-[#1E2738] text-[#1E2430] dark:text-[#F4F7FC] hover:bg-[#E0ECFF]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Orientation */}
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-[#647084] dark:text-[#A8B3C7]">
                Orientation
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'auto', label: 'Auto' },
                    { id: 'portrait', label: 'Portrait' },
                    { id: 'landscape', label: 'Landscape' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setOrientation(opt.id)}
                    className={`min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                      orientation === opt.id
                        ? 'bg-[#2563EB] text-white'
                        : 'bg-[#F3F7FF] dark:bg-[#1E2738] text-[#1E2430] dark:text-[#F4F7FC] hover:bg-[#E0ECFF]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Image Fit */}
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-[#647084] dark:text-[#A8B3C7]">
                Image Fit
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'margins', label: 'White Margins' },
                    { id: 'fit', label: 'Fit Ratio' },
                    { id: 'fill', label: 'Fill Page' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFitMode(opt.id)}
                    className={`min-h-[44px] px-2 rounded-xl text-xs font-semibold transition-colors ${
                      fitMode === opt.id
                        ? 'bg-[#2563EB] text-white'
                        : 'bg-[#F3F7FF] dark:bg-[#1E2738] text-[#1E2430] dark:text-[#F4F7FC] hover:bg-[#E0ECFF]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality */}
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-[#647084] dark:text-[#A8B3C7]">
                PDF Quality
              </span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'high', label: 'High' },
                    { id: 'balanced', label: 'Balanced' },
                    { id: 'compact', label: 'Compact' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setQuality(opt.id)}
                    className={`min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                      quality === opt.id
                        ? 'bg-[#2563EB] text-white'
                        : 'bg-[#F3F7FF] dark:bg-[#1E2738] text-[#1E2430] dark:text-[#F4F7FC] hover:bg-[#E0ECFF]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Page Numbers & Watermark */}
            <div className="rounded-2xl bg-[#F3F7FF] dark:bg-[#1E2738] p-3.5 space-y-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-[#1E2430] dark:text-[#F4F7FC]">
                    Add Page Numbers
                  </div>
                  <div className="text-[11px] text-[#647084] dark:text-[#A8B3C7]">
                    Footer label (1 / {pages.length}) on every page
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={addPageNumbers}
                  onChange={(e) => setAddPageNumbers(e.target.checked)}
                  className="w-5 h-5 accent-[#2563EB] rounded cursor-pointer"
                />
              </label>

              <div className="space-y-1 pt-2 border-t border-[#D9E4F8] dark:border-[#2A3954]">
                <label
                  htmlFor="pdf-watermark-input"
                  className="block text-[11px] font-semibold text-[#647084] dark:text-[#A8B3C7]"
                >
                  Optional Watermark Stamp
                </label>
                <input
                  id="pdf-watermark-input"
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  maxLength={28}
                  placeholder="e.g. CONFIDENTIAL or DRAFT"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-[#CFDCF4] dark:border-[#27354F] bg-white dark:bg-[#111622] text-xs sm:text-sm outline-none focus:border-[#2563EB]"
                />
              </div>
            </div>

            {/* Password Protection */}
            <div className="rounded-2xl bg-[#F3F7FF] dark:bg-[#1E2738] p-3.5 space-y-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-[#2563EB] shrink-0" />
                  <div>
                    <div className="text-xs sm:text-sm font-semibold text-[#1E2430] dark:text-[#F4F7FC]">
                      Protect PDF with Password (AES-256)
                    </div>
                    <div className="text-[11px] text-[#647084] dark:text-[#A8B3C7]">
                      Require a password to open &amp; keep PDF safe
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={protectPdf}
                  onChange={(e) => setProtectPdf(e.target.checked)}
                  className="w-5 h-5 accent-[#2563EB] rounded cursor-pointer"
                />
              </label>

              {protectPdf && (
                <div className="flex items-center rounded-xl border border-[#CFDCF4] dark:border-[#27354F] bg-white dark:bg-[#111622] px-3 focus-within:border-[#2563EB]">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={pdfPassword}
                    onChange={(e) => setPdfPassword(e.target.value)}
                    placeholder="Enter password to lock PDF"
                    aria-label="PDF password"
                    className="w-full min-h-[44px] bg-transparent text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="p-2 text-[#647084] hover:text-[#2563EB]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={generating || pages.length === 0}
              className="w-full min-h-[52px] rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-base font-bold inline-flex items-center justify-center gap-2.5 shadow-sm active:scale-[0.99] transition-all"
            >
              <FileCheck2 className="w-5 h-5" />
              <span>Create PDF ({pages.length} {pages.length === 1 ? 'Page' : 'Pages'})</span>
            </button>
          </div>
        </div>
      )}

      {/* Full Page Crop/Filter/Rotate/Resize Modal */}
      <PageEditModal
        page={editingPage}
        pageIndex={editingIndex >= 0 ? editingIndex : undefined}
        totalPages={pages.length}
        onClose={() => setEditingPageId(null)}
        onSave={(updated) => {
          setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          setEditingPageId(null);
          onNotify('success', 'Page edits applied.');
        }}
        onApplyFilterToAll={async (filterChoice) => {
          setEditingPageId(null);
          await handleApplyFilterToAll(filterChoice);
        }}
      />

      {/* Generation Progress Modal */}
      {generating && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Generating PDF"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#181F2E] p-6 shadow-xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#E0ECFF] dark:bg-[#1D2A44] text-[#2563EB] flex items-center justify-center mx-auto">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#1E2430] dark:text-[#F4F7FC]">
                Creating Your PDF
              </h3>
              <p className="mt-1 text-sm text-[#647084] dark:text-[#A8B3C7] tabular-nums">
                Processing page {Math.min(progress.current + 1, progress.total)} of {progress.total}
              </p>
            </div>
            <div className="h-2.5 w-full rounded-full bg-[#E0ECFF] dark:bg-[#1D2A44] overflow-hidden">
              <div
                className="h-full bg-[#2563EB] transition-all duration-200"
                style={{
                  width: `${
                    progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 15
                  }%`,
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => abortControllerRef.current?.abort()}
              className="min-h-[44px] px-5 rounded-xl bg-[#EDF2FA] dark:bg-[#232E42] text-sm font-semibold text-[#1E2430] dark:text-[#F4F7FC] hover:bg-[#E1E9F7] inline-flex items-center gap-1.5"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      )}

      {/* Delete Page Confirmation */}
      <ConfirmModal
        open={Boolean(deleteTargetId)}
        title="Delete Page?"
        message="This page will be removed from your current PDF draft."
        confirmLabel="Delete Page"
        onConfirm={handleConfirmDeletePage}
        onCancel={() => setDeleteTargetId(null)}
      />

      {/* Discard Draft Confirmation */}
      <ConfirmModal
        open={confirmDiscardOpen}
        title="Discard Unsaved Pages?"
        message="You have unsaved pages in the editor. Going back will clear your current draft."
        confirmLabel="Discard Draft"
        cancelLabel="Keep Editing"
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          onExitToHome();
        }}
        onCancel={() => setConfirmDiscardOpen(false)}
      />
    </div>
  );
}

import React, { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Combine,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FileSearch,
  ImageDown,
  Images,
  Layers,
  Lock,
  Minimize2,
  RotateCw,
  Scissors,
  X,
} from 'lucide-react';
import {
  ActiveToolId,
  PdfDocumentRecord,
  PdfMetadataInfo,
  QualityPreset,
} from '../types/pinkora';
import {
  compressPdf,
  encryptPdfBytes,
  extractPdfPages,
  inspectPdfMetadata,
  mergePdfs,
  renderAllPdfThumbnails,
  renderPdfPagesAsImages,
  rotatePdfPages,
  splitPdfByRange,
} from '../services/pdfEngine';
import { ensureUniqueFilename, formatBytes } from '../services/storage';

interface ToolsScreenProps {
  documents: PdfDocumentRecord[];
  onImagesToPdf: () => void;
  onSaveResult: (doc: PdfDocumentRecord) => Promise<void>;
  onOpenViewer: (doc: PdfDocumentRecord) => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

interface SourcePdfItem {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
}

export function ToolsScreen({
  documents,
  onImagesToPdf,
  onSaveResult,
  onOpenViewer,
  onNotify,
}: ToolsScreenProps) {
  const [activeTool, setActiveTool] = useState<ActiveToolId | null>(null);
  const [working, setWorking] = useState(false);

  // Merge state
  const [mergeList, setMergeList] = useState<SourcePdfItem[]>([]);

  // Single-PDF tool state
  const [selectedPdf, setSelectedPdf] = useState<SourcePdfItem | null>(null);
  const [pageThumbs, setPageThumbs] = useState<string[]>([]);
  const [loadingThumbs, setLoadingThumbs] = useState(false);

  // Split
  const [splitStart, setSplitStart] = useState(1);
  const [splitEnd, setSplitEnd] = useState(1);

  // Extract
  const [extractSelected, setExtractSelected] = useState<number[]>([]);

  // Rotate
  const [rotations, setRotations] = useState<Record<number, number>>({});

  // Compress
  const [compressPreset, setCompressPreset] = useState<QualityPreset>('balanced');
  const [compressProgress, setCompressProgress] = useState({ current: 0, total: 0 });

  // Info
  const [pdfInfo, setPdfInfo] = useState<PdfMetadataInfo | null>(null);

  // Protect
  const [protectPassword, setProtectPassword] = useState('');
  const [showProtectPw, setShowProtectPw] = useState(false);

  // PDF to Images
  const [renderedImages, setRenderedImages] = useState<
    Array<{ page: number; dataUrl: string; width: number; height: number }>
  >([]);

  const devicePdfInputRef = useRef<HTMLInputElement | null>(null);

  const resetToolState = () => {
    setMergeList([]);
    setSelectedPdf(null);
    setPageThumbs([]);
    setSplitStart(1);
    setSplitEnd(1);
    setExtractSelected([]);
    setRotations({});
    setPdfInfo(null);
    setProtectPassword('');
    setShowProtectPw(false);
    setRenderedImages([]);
    setCompressProgress({ current: 0, total: 0 });
  };

  const openTool = (id: ActiveToolId) => {
    if (id === 'images_to_pdf') {
      onImagesToPdf();
      return;
    }
    resetToolState();
    setActiveTool(id);
  };

  const loadSinglePdf = async (item: SourcePdfItem) => {
    setSelectedPdf(item);
    setSplitStart(1);
    setSplitEnd(item.pageCount);
    setExtractSelected([]);
    setRotations({});
    setPdfInfo(null);
    setRenderedImages([]);

    if (activeTool === 'pdf_info') {
      try {
        const info = await inspectPdfMetadata(item.bytes, item.name);
        setPdfInfo(info);
      } catch {
        onNotify('error', 'Could not inspect this PDF.');
      }
      return;
    }

    if (activeTool === 'pdf_to_images') {
      setLoadingThumbs(true);
      try {
        const imgs = await renderPdfPagesAsImages(item.bytes, 1.8);
        setRenderedImages(imgs);
      } catch {
        onNotify('error', 'Could not convert PDF pages to images.');
      } finally {
        setLoadingThumbs(false);
      }
      return;
    }

    if (activeTool === 'extract_pages' || activeTool === 'rotate_pages') {
      setLoadingThumbs(true);
      try {
        const thumbs = await renderAllPdfThumbnails(item.bytes, 160);
        setPageThumbs(thumbs);
      } catch {
        onNotify('error', 'Could not render page thumbnails.');
      } finally {
        setLoadingThumbs(false);
      }
    }
  };

  const handleUploadPdfFromDevice = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    for (const f of files) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const info = await inspectPdfMetadata(bytes, f.name);
        const item: SourcePdfItem = {
          id: `dev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: f.name,
          bytes,
          pageCount: info.pageCount,
        };
        if (activeTool === 'merge_pdfs') {
          setMergeList((prev) => [...prev, item]);
        } else {
          await loadSinglePdf(item);
          break;
        }
      } catch {
        onNotify('error', `"${f.name}" is not a valid readable PDF.`);
      }
    }
  };

  const saveAndOpen = async (
    baseName: string,
    res: { pdfBytes: Uint8Array; pageCount: number; thumbnailDataUrl: string; isProtected?: boolean }
  ) => {
    const finalName = ensureUniqueFilename(
      baseName,
      documents.map((d) => d.name)
    );
    const now = Date.now();
    const record: PdfDocumentRecord = {
      id: `doc_${now}_${Math.random().toString(36).slice(2, 8)}`,
      name: finalName,
      createdAt: now,
      updatedAt: now,
      pageCount: res.pageCount,
      sizeBytes: res.pdfBytes.byteLength,
      thumbnailDataUrl: res.thumbnailDataUrl,
      pdfBytes: res.pdfBytes,
      isProtected: Boolean(res.isProtected),
    };
    await onSaveResult(record);
    onNotify('success', `Created "${finalName}" (${formatBytes(record.sizeBytes)})`);
    setActiveTool(null);
    onOpenViewer(record);
  };

  const handleRunMerge = async () => {
    if (mergeList.length < 2) return;
    setWorking(true);
    try {
      const res = await mergePdfs(mergeList.map((m) => ({ name: m.name, bytes: m.bytes })));
      await saveAndOpen(`Pinkora_Merged_${new Date().toISOString().slice(0, 10)}.pdf`, res);
    } catch (err) {
      onNotify('error', (err as Error)?.message || 'Merge failed.');
    } finally {
      setWorking(false);
    }
  };

  const handleRunSplit = async () => {
    if (!selectedPdf) return;
    setWorking(true);
    try {
      const res = await splitPdfByRange(selectedPdf.bytes, splitStart, splitEnd);
      const stem = selectedPdf.name.replace(/\.pdf$/i, '');
      await saveAndOpen(`${stem}_p${splitStart}-${splitEnd}.pdf`, res);
    } catch (err) {
      onNotify('error', (err as Error)?.message || 'Split failed.');
    } finally {
      setWorking(false);
    }
  };

  const handleRunExtract = async () => {
    if (!selectedPdf || extractSelected.length === 0) return;
    setWorking(true);
    try {
      const sorted = [...extractSelected].sort((a, b) => a - b);
      const res = await extractPdfPages(selectedPdf.bytes, sorted);
      const stem = selectedPdf.name.replace(/\.pdf$/i, '');
      await saveAndOpen(`${stem}_extracted.pdf`, res);
    } catch (err) {
      onNotify('error', (err as Error)?.message || 'Extract failed.');
    } finally {
      setWorking(false);
    }
  };

  const handleRunRotate = async () => {
    if (!selectedPdf) return;
    setWorking(true);
    try {
      const res = await rotatePdfPages(selectedPdf.bytes, rotations);
      const stem = selectedPdf.name.replace(/\.pdf$/i, '');
      await saveAndOpen(`${stem}_rotated.pdf`, res);
    } catch (err) {
      onNotify('error', (err as Error)?.message || 'Rotate failed.');
    } finally {
      setWorking(false);
    }
  };

  const handleRunCompress = async () => {
    if (!selectedPdf) return;
    setWorking(true);
    setCompressProgress({ current: 0, total: selectedPdf.pageCount });
    try {
      const res = await compressPdf(selectedPdf.bytes, compressPreset, (current, total) =>
        setCompressProgress({ current, total })
      );
      const stem = selectedPdf.name.replace(/\.pdf$/i, '');
      const savedRatio = Math.max(
        0,
        Math.round((1 - res.pdfBytes.byteLength / selectedPdf.bytes.byteLength) * 100)
      );
      onNotify(
        'info',
        `Compressed from ${formatBytes(selectedPdf.bytes.byteLength)} to ${formatBytes(
          res.pdfBytes.byteLength
        )} (${savedRatio}% smaller).`
      );
      await saveAndOpen(`${stem}_compressed.pdf`, res);
    } catch (err) {
      onNotify('error', (err as Error)?.message || 'Compression failed.');
    } finally {
      setWorking(false);
    }
  };

  const handleRunProtect = async () => {
    if (!selectedPdf) return;
    if (protectPassword.trim().length === 0) {
      onNotify('error', 'Enter a password to protect this PDF.');
      return;
    }
    setWorking(true);
    try {
      const res = await encryptPdfBytes(selectedPdf.bytes, protectPassword);
      const stem = selectedPdf.name.replace(/\.pdf$/i, '');
      await saveAndOpen(`${stem}_locked.pdf`, { ...res, isProtected: true });
    } catch (err) {
      onNotify(
        'error',
        (err as Error)?.message ||
          'Failed to encrypt PDF. Make sure the source PDF is not already locked.'
      );
    } finally {
      setWorking(false);
    }
  };

  const downloadImageDataUrl = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const tools = [
    {
      id: 'images_to_pdf' as ActiveToolId,
      title: 'Images to PDF',
      desc: 'Select gallery photos, crop edges, and convert into one PDF.',
      icon: Images,
    },
    {
      id: 'pdf_to_images' as ActiveToolId,
      title: 'PDF to Images',
      desc: 'Export each page of any PDF as crisp PNG images.',
      icon: ImageDown,
    },
    {
      id: 'protect_pdf' as ActiveToolId,
      title: 'Protect PDF',
      desc: 'Add AES-256 password encryption to lock any PDF.',
      icon: Lock,
    },
    {
      id: 'merge_pdfs' as ActiveToolId,
      title: 'Merge PDFs',
      desc: 'Combine two or more PDF documents in your chosen order.',
      icon: Combine,
    },
    {
      id: 'split_pdf' as ActiveToolId,
      title: 'Split PDF',
      desc: 'Extract a continuous page range into a separate PDF file.',
      icon: Scissors,
    },
    {
      id: 'extract_pages' as ActiveToolId,
      title: 'Extract Pages',
      desc: 'Pick specific pages visually and save them as a new PDF.',
      icon: Layers,
    },
    {
      id: 'rotate_pages' as ActiveToolId,
      title: 'Rotate PDF Pages',
      desc: 'Fix sideways or upside-down pages inside any PDF.',
      icon: RotateCw,
    },
    {
      id: 'compress_pdf' as ActiveToolId,
      title: 'Compress PDF',
      desc: 'Reduce PDF file size using balanced or compact presets.',
      icon: Minimize2,
    },
    {
      id: 'pdf_info' as ActiveToolId,
      title: 'View PDF Info',
      desc: 'Inspect page dimensions, page count, and PDF metadata.',
      icon: FileSearch,
    },
  ];

  // Active Tool Workspace
  if (activeTool) {
    const activeMeta = tools.find((t) => t.id === activeTool)!;
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setActiveTool(null);
                resetToolState();
              }}
              aria-label="Back to Tools"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] hover:border-[#2563EB]"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-extrabold text-[#1E2430] dark:text-[#F4F7FC]">
                {activeMeta.title}
              </h1>
              <p className="text-xs sm:text-sm text-[#647084] dark:text-[#A8B3C7]">
                {activeMeta.desc}
              </p>
            </div>
          </div>
        </div>

        <input
          ref={devicePdfInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple={activeTool === 'merge_pdfs'}
          className="hidden"
          onChange={handleUploadPdfFromDevice}
        />

        {/* Source PDF Picker */}
        {(activeTool === 'merge_pdfs' || !selectedPdf) && (
          <div className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm sm:text-base font-bold">
                {activeTool === 'merge_pdfs'
                  ? 'Add PDFs to Merge'
                  : 'Choose a PDF Document'}
              </h2>
              <button
                type="button"
                onClick={() => devicePdfInputRef.current?.click()}
                className="min-h-[44px] px-4 rounded-xl bg-[#E0ECFF] dark:bg-[#1D2A44] hover:bg-[#C7DBFE] text-[#1D4ED8] dark:text-[#60A5FA] text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors"
              >
                <FilePlus2 className="w-4 h-4" />
                <span>Pick PDF from Device</span>
              </button>
            </div>

            {documents.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {documents.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => {
                      const item: SourcePdfItem = {
                        id: `${doc.id}_${Date.now()}`,
                        name: doc.name,
                        bytes: doc.pdfBytes,
                        pageCount: doc.pageCount,
                      };
                      if (activeTool === 'merge_pdfs') {
                        setMergeList((prev) => [...prev, item]);
                      } else {
                        loadSinglePdf(item);
                      }
                    }}
                    className="min-h-[56px] p-3 rounded-2xl border border-[#D9E4F8] dark:border-[#27354F] hover:border-[#2563EB] bg-[#F8FAFF] dark:bg-[#141A26] text-left flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{doc.name}</div>
                      <div className="text-xs text-[#647084] dark:text-[#A8B3C7] tabular-nums">
                        {doc.pageCount} pages · {formatBytes(doc.sizeBytes)}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-[#2563EB] shrink-0">
                      {activeTool === 'merge_pdfs' ? '+ Add' : 'Select'}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#647084] dark:text-[#A8B3C7]">
                No saved PDFs in My Files yet. Pick a PDF from your device above to process it.
              </p>
            )}
          </div>
        )}

        {/* MERGE LIST */}
        {activeTool === 'merge_pdfs' && mergeList.length > 0 && (
          <div className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-5 space-y-4">
            <h3 className="text-sm font-bold tabular-nums">
              Merge Queue ({mergeList.length} files)
            </h3>
            <div className="space-y-2">
              {mergeList.map((m, idx) => (
                <div
                  key={m.id}
                  className="p-3 rounded-2xl bg-[#F3F7FF] dark:bg-[#1E2738] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {idx + 1}. {m.name}
                    </div>
                    <div className="text-xs text-[#647084] dark:text-[#A8B3C7] tabular-nums">
                      {m.pageCount} pages · {formatBytes(m.bytes.byteLength)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() =>
                        setMergeList((prev) => {
                          const next = [...prev];
                          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                          return next;
                        })
                      }
                      aria-label="Move up"
                      className="p-2 rounded-lg hover:bg-white/60 disabled:opacity-30"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === mergeList.length - 1}
                      onClick={() =>
                        setMergeList((prev) => {
                          const next = [...prev];
                          [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                          return next;
                        })
                      }
                      aria-label="Move down"
                      className="p-2 rounded-lg hover:bg-white/60 disabled:opacity-30"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMergeList((prev) => prev.filter((x) => x.id !== m.id))}
                      aria-label="Remove from merge"
                      className="p-2 rounded-lg text-[#D9364F] hover:bg-white/60"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={mergeList.length < 2 || working}
              onClick={handleRunMerge}
              className="w-full min-h-[48px] rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-45 text-white text-sm font-bold"
            >
              {working ? 'Merging PDFs...' : `Merge ${mergeList.length} PDFs`}
            </button>
          </div>
        )}

        {/* SPLIT PDF */}
        {activeTool === 'split_pdf' && selectedPdf && (
          <div className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">{selectedPdf.name}</h3>
                <p className="text-xs text-[#647084] dark:text-[#A8B3C7] tabular-nums">
                  Total pages: {selectedPdf.pageCount}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPdf(null)}
                className="text-xs font-semibold text-[#2563EB]"
              >
                Change file
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#647084] mb-1">
                  Start Page
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedPdf.pageCount}
                  value={splitStart}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(selectedPdf.pageCount, Number(e.target.value) || 1));
                    setSplitStart(v);
                    if (splitEnd < v) setSplitEnd(v);
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-[#CFDCF4] dark:border-[#27354F] bg-[#F8FAFF] dark:bg-[#111622] text-sm font-semibold tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#647084] mb-1">
                  End Page
                </label>
                <input
                  type="number"
                  min={splitStart}
                  max={selectedPdf.pageCount}
                  value={splitEnd}
                  onChange={(e) => {
                    const v = Math.max(
                      splitStart,
                      Math.min(selectedPdf.pageCount, Number(e.target.value) || splitStart)
                    );
                    setSplitEnd(v);
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-[#CFDCF4] dark:border-[#27354F] bg-[#F8FAFF] dark:bg-[#111622] text-sm font-semibold tabular-nums"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={working}
              onClick={handleRunSplit}
              className="w-full min-h-[48px] rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-bold"
            >
              {working ? 'Splitting...' : `Save Pages ${splitStart}–${splitEnd} as New PDF`}
            </button>
          </div>
        )}

        {/* EXTRACT PAGES */}
        {activeTool === 'extract_pages' && selectedPdf && (
          <div className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">{selectedPdf.name}</h3>
                <p className="text-xs text-[#647084] dark:text-[#A8B3C7]">
                  Tap pages to include ({extractSelected.length} selected)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPdf(null)}
                className="text-xs font-semibold text-[#2563EB]"
              >
                Change file
              </button>
            </div>

            {loadingThumbs ? (
              <p className="text-sm text-[#647084]">Rendering page previews...</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {pageThumbs.map((src, idx) => {
                  const p = idx + 1;
                  const checked = extractSelected.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setExtractSelected((prev) =>
                          prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                        )
                      }
                      className={`p-2 rounded-2xl border text-center transition-all ${
                        checked
                          ? 'border-[#2563EB] bg-[#E0ECFF] dark:bg-[#1D2A44]'
                          : 'border-[#D9E4F8] dark:border-[#27354F] bg-[#F8FAFF] dark:bg-[#141A26]'
                      }`}
                    >
                      <img
                        src={src}
                        alt={`Page ${p}`}
                        className="w-full aspect-[3/4] object-contain rounded-lg bg-white"
                      />
                      <span className="mt-1.5 block text-xs font-bold tabular-nums">
                        Page {p}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              disabled={extractSelected.length === 0 || working}
              onClick={handleRunExtract}
              className="w-full min-h-[48px] rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-45 text-white text-sm font-bold"
            >
              {working
                ? 'Extracting...'
                : `Extract ${extractSelected.length} Selected ${
                    extractSelected.length === 1 ? 'Page' : 'Pages'
                  }`}
            </button>
          </div>
        )}

        {/* ROTATE PDF PAGES */}
        {activeTool === 'rotate_pages' && selectedPdf && (
          <div className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold">{selectedPdf.name}</h3>
                <p className="text-xs text-[#647084] dark:text-[#A8B3C7]">
                  Tap a page to rotate it 90° clockwise
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<number, number> = {};
                    for (let p = 1; p <= selectedPdf.pageCount; p++) {
                      next[p] = ((rotations[p] || 0) + 90) % 360;
                    }
                    setRotations(next);
                  }}
                  className="text-xs font-semibold text-[#2563EB]"
                >
                  Rotate All +90°
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPdf(null)}
                  className="text-xs font-semibold text-[#647084]"
                >
                  Change file
                </button>
              </div>
            </div>

            {loadingThumbs ? (
              <p className="text-sm text-[#647084]">Rendering page previews...</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {pageThumbs.map((src, idx) => {
                  const p = idx + 1;
                  const deg = rotations[p] || 0;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setRotations((prev) => ({ ...prev, [p]: ((prev[p] || 0) + 90) % 360 }))
                      }
                      className="p-2 rounded-2xl border border-[#D9E4F8] dark:border-[#27354F] hover:border-[#2563EB] bg-[#F8FAFF] dark:bg-[#141A26] text-center"
                    >
                      <div className="w-full aspect-[3/4] flex items-center justify-center overflow-hidden rounded-lg bg-white">
                        <img
                          src={src}
                          alt={`Page ${p}`}
                          style={{ transform: `rotate(${deg}deg)` }}
                          className="max-w-full max-h-full object-contain transition-transform"
                        />
                      </div>
                      <span className="mt-1.5 block text-xs font-bold tabular-nums">
                        Page {p} {deg > 0 ? `(${deg}°)` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              disabled={working}
              onClick={handleRunRotate}
              className="w-full min-h-[48px] rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-bold"
            >
              {working ? 'Saving Rotated PDF...' : 'Save Rotated PDF'}
            </button>
          </div>
        )}

        {/* COMPRESS PDF */}
        {activeTool === 'compress_pdf' && selectedPdf && (
          <div className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">{selectedPdf.name}</h3>
                <p className="text-xs text-[#647084] dark:text-[#A8B3C7] tabular-nums">
                  Current size: {formatBytes(selectedPdf.bytes.byteLength)} · {selectedPdf.pageCount} pages
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPdf(null)}
                className="text-xs font-semibold text-[#2563EB]"
              >
                Change file
              </button>
            </div>

            <p className="text-xs text-[#647084] dark:text-[#A8B3C7] leading-relaxed">
              Compression re-encodes rendered pages at lower image resolution. Smaller file sizes reduce fine image sharpness.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(
                [
                  { id: 'high', title: 'Light Compression', desc: 'Crisp quality, moderate savings' },
                  { id: 'balanced', title: 'Balanced', desc: 'Recommended for sharing' },
                  { id: 'compact', title: 'Maximum Savings', desc: 'Smallest file, lower image detail' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setCompressPreset(p.id)}
                  className={`p-3.5 rounded-2xl border text-left transition-colors ${
                    compressPreset === p.id
                      ? 'border-[#2563EB] bg-[#E0ECFF] dark:bg-[#1D2A44]'
                      : 'border-[#D9E4F8] dark:border-[#27354F] bg-[#F8FAFF] dark:bg-[#141A26]'
                  }`}
                >
                  <div className="text-sm font-bold">{p.title}</div>
                  <div className="mt-0.5 text-xs text-[#647084] dark:text-[#A8B3C7]">{p.desc}</div>
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={working}
              onClick={handleRunCompress}
              className="w-full min-h-[48px] rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-bold"
            >
              {working
                ? `Compressing page ${compressProgress.current} of ${compressProgress.total}...`
                : 'Compress & Save New PDF'}
            </button>
          </div>
        )}

        {/* PDF INFO */}
        {activeTool === 'pdf_info' && selectedPdf && pdfInfo && (
          <div className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">{pdfInfo.fileName}</h3>
              <button
                type="button"
                onClick={() => setSelectedPdf(null)}
                className="text-xs font-semibold text-[#2563EB]"
              >
                Inspect another
              </button>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between py-2 border-b border-[#D9E4F8] dark:border-[#27354F]">
                <span className="text-[#647084] dark:text-[#A8B3C7]">Page count</span>
                <span className="font-semibold tabular-nums">{pdfInfo.pageCount}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#D9E4F8] dark:border-[#27354F]">
                <span className="text-[#647084] dark:text-[#A8B3C7]">File size</span>
                <span className="font-semibold tabular-nums">{formatBytes(pdfInfo.sizeBytes)}</span>
              </div>
              {pdfInfo.title && (
                <div className="flex justify-between py-2 border-b border-[#D9E4F8] dark:border-[#27354F]">
                  <span className="text-[#647084] dark:text-[#A8B3C7]">PDF Title</span>
                  <span className="font-semibold">{pdfInfo.title}</span>
                </div>
              )}
              {pdfInfo.creator && (
                <div className="flex justify-between py-2 border-b border-[#D9E4F8] dark:border-[#27354F]">
                  <span className="text-[#647084] dark:text-[#A8B3C7]">Creator</span>
                  <span className="font-semibold">{pdfInfo.creator}</span>
                </div>
              )}
              {pdfInfo.creationDate && (
                <div className="flex justify-between py-2 border-b border-[#D9E4F8] dark:border-[#27354F]">
                  <span className="text-[#647084] dark:text-[#A8B3C7]">Created</span>
                  <span className="font-semibold tabular-nums">{pdfInfo.creationDate}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#647084] dark:text-[#A8B3C7]">
                Page Dimensions (Points)
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs tabular-nums">
                {pdfInfo.pageDimensions.map((d) => (
                  <div
                    key={d.page}
                    className="flex justify-between px-3 py-2 rounded-xl bg-[#F3F7FF] dark:bg-[#1E2738]"
                  >
                    <span>Page {d.page}</span>
                    <span className="font-mono">
                      {d.widthPt} × {d.heightPt} pt
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PROTECT PDF */}
        {activeTool === 'protect_pdf' && selectedPdf && (
          <div className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">{selectedPdf.name}</h3>
                <p className="text-xs text-[#647084] dark:text-[#A8B3C7] tabular-nums">
                  {selectedPdf.pageCount} pages · {formatBytes(selectedPdf.bytes.byteLength)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPdf(null)}
                className="text-xs font-semibold text-[#2563EB]"
              >
                Change file
              </button>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="tool-protect-password"
                className="block text-xs font-semibold text-[#647084] dark:text-[#A8B3C7]"
              >
                New Password (AES-256 Encryption)
              </label>
              <div className="flex items-center rounded-xl border border-[#CFDCF4] dark:border-[#27354F] bg-[#F8FAFF] dark:bg-[#111622] px-3 focus-within:border-[#2563EB]">
                <input
                  id="tool-protect-password"
                  type={showProtectPw ? 'text' : 'password'}
                  value={protectPassword}
                  onChange={(e) => setProtectPassword(e.target.value)}
                  placeholder="Enter password to lock PDF"
                  autoFocus
                  className="w-full min-h-[44px] bg-transparent text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowProtectPw((s) => !s)}
                  aria-label={showProtectPw ? 'Hide password' : 'Show password'}
                  className="p-2 text-[#647084] hover:text-[#2563EB]"
                >
                  {showProtectPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={working || protectPassword.trim().length === 0}
              onClick={handleRunProtect}
              className="w-full min-h-[48px] rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-bold inline-flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>{working ? 'Encrypting PDF...' : 'Encrypt & Save Protected PDF'}</span>
            </button>
          </div>
        )}

        {/* PDF TO IMAGES */}
        {activeTool === 'pdf_to_images' && selectedPdf && (
          <div className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold">{selectedPdf.name}</h3>
                <p className="text-xs text-[#647084] dark:text-[#A8B3C7] tabular-nums">
                  {selectedPdf.pageCount} {selectedPdf.pageCount === 1 ? 'page' : 'pages'} ready to export as PNG
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPdf(null)}
                className="text-xs font-semibold text-[#2563EB]"
              >
                Change file
              </button>
            </div>

            {loadingThumbs ? (
              <p className="text-sm text-[#647084]">Rendering PDF pages to PNG...</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {renderedImages.map((img) => {
                    const stem = selectedPdf.name.replace(/\.pdf$/i, '');
                    const outName = `${stem}_page_${img.page}.png`;
                    return (
                      <div
                        key={img.page}
                        className="p-2.5 rounded-2xl border border-[#D9E4F8] dark:border-[#27354F] bg-[#F8FAFF] dark:bg-[#141A26] space-y-2"
                      >
                        <img
                          src={img.dataUrl}
                          alt={`Page ${img.page}`}
                          className="w-full aspect-[3/4] object-contain rounded-lg bg-white"
                        />
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold tabular-nums">
                            Page {img.page}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              downloadImageDataUrl(img.dataUrl, outName);
                              onNotify('success', `Downloaded ${outName}`);
                            }}
                            aria-label={`Download page ${img.page} PNG`}
                            className="min-h-[36px] px-2.5 rounded-lg bg-[#E0ECFF] dark:bg-[#1D2A44] text-[#1D4ED8] dark:text-[#60A5FA] text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>PNG</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {renderedImages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const stem = selectedPdf.name.replace(/\.pdf$/i, '');
                      renderedImages.forEach((img, idx) => {
                        window.setTimeout(() => {
                          downloadImageDataUrl(img.dataUrl, `${stem}_page_${img.page}.png`);
                        }, idx * 220);
                      });
                      onNotify('success', `Exporting ${renderedImages.length} PNG images...`);
                    }}
                    className="w-full min-h-[48px] rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-bold inline-flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download All {renderedImages.length} PNG Images</span>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#1E2430] dark:text-[#F4F7FC]">
          PDF Tools
        </h1>
        <p className="text-xs sm:text-sm text-[#647084] dark:text-[#A8B3C7]">
          Process, protect, merge, split, rotate, and inspect PDFs locally on your device.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => openTool(tool.id)}
              className="group text-left rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] hover:border-[#2563EB] p-5 transition-all active:scale-[0.99] flex flex-col justify-between min-h-[132px]"
            >
              <div className="w-11 h-11 rounded-2xl bg-[#F3F7FF] dark:bg-[#1E2B45] text-[#2563EB] flex items-center justify-center group-hover:bg-[#2563EB] group-hover:text-white transition-colors">
                <Icon className="w-5 h-5" />
              </div>
              <div className="mt-4">
                <div className="text-base font-bold text-[#1E2430] dark:text-[#F4F7FC]">
                  {tool.title}
                </div>
                <p className="mt-1 text-xs sm:text-sm text-[#647084] dark:text-[#A8B3C7] leading-snug">
                  {tool.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

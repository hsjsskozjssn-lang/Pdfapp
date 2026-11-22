import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  Lock,
  Pencil,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';
import { PdfDocumentRecord } from '../types/pinkora';
import {
  ensureUniqueFilename,
  formatBytes,
  formatShortDate,
} from '../services/storage';
import { generatePdfThumbnail, openPdfProxy } from '../services/pdfEngine';

interface MyFilesScreenProps {
  documents: PdfDocumentRecord[];
  onRefresh: () => Promise<void>;
  onImportPdf: (doc: PdfDocumentRecord) => Promise<void>;
  onOpenPdf: (doc: PdfDocumentRecord) => void;
  onSharePdf: (doc: PdfDocumentRecord) => void;
  onSaveCopy: (doc: PdfDocumentRecord) => void;
  onRenamePdf: (doc: PdfDocumentRecord) => void;
  onDeletePdf: (doc: PdfDocumentRecord) => void;
  onCreateNewPdf: () => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

type SortMode = 'newest' | 'oldest' | 'name' | 'size';

export function MyFilesScreen({
  documents,
  onRefresh,
  onImportPdf,
  onOpenPdf,
  onSharePdf,
  onSaveCopy,
  onRenamePdf,
  onDeletePdf,
  onCreateNewPdf,
  onNotify,
}: MyFilesScreenProps) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortMode>('newest');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? documents.filter((d) => d.name.toLowerCase().includes(q))
      : [...documents];

    list.sort((a, b) => {
      if (sortBy === 'newest') return b.updatedAt - a.updatedAt;
      if (sortBy === 'oldest') return a.updatedAt - b.updatedAt;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return b.sizeBytes - a.sizeBytes;
    });
    return list;
  }, [documents, query, sortBy]);

  const handleImportDevicePdfs = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    setImporting(true);
    let importedCount = 0;
    const existingNames = documents.map((d) => d.name);

    for (const file of files) {
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const proxy = await openPdfProxy(bytes);
        const pageCount = proxy.numPages;
        await proxy.loadingTask.destroy();
        const thumb = await generatePdfThumbnail(bytes, 300).catch(() => '');
        const uniqueName = ensureUniqueFilename(file.name, existingNames);
        existingNames.push(uniqueName);
        const now = Date.now();
        await onImportPdf({
          id: `doc_${now}_${Math.random().toString(36).slice(2, 8)}`,
          name: uniqueName,
          createdAt: now,
          updatedAt: now,
          pageCount,
          sizeBytes: bytes.byteLength,
          thumbnailDataUrl: thumb,
          pdfBytes: bytes,
        });
        importedCount++;
      } catch {
        onNotify('error', `Skipped "${file.name}" — could not parse as a valid PDF.`);
      }
    }

    setImporting(false);
    if (importedCount > 0) {
      await onRefresh();
      onNotify(
        'success',
        `Imported ${importedCount} PDF ${importedCount === 1 ? 'file' : 'files'} into My Files.`
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#1E2430] dark:text-[#F4F7FC]">
            My Files
          </h1>
          <p className="text-xs sm:text-sm text-[#647084] dark:text-[#A8B3C7] tabular-nums">
            {documents.length} saved {documents.length === 1 ? 'document' : 'documents'} stored locally on this device
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={handleImportDevicePdfs}
          />
          <button
            type="button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-4 rounded-xl bg-white dark:bg-[#181F2E] border border-[#CFDCF4] dark:border-[#27354F] hover:border-[#2563EB] text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <FilePlus2 className="w-4 h-4 text-[#2563EB]" />
            <span>{importing ? 'Importing...' : 'Import PDF'}</span>
          </button>
          <button
            type="button"
            onClick={onCreateNewPdf}
            className="min-h-[44px] px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <span>New PDF</span>
          </button>
        </div>
      </div>

      {/* Search & Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex items-center gap-2.5 rounded-2xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] px-3.5 focus-within:border-[#2563EB]">
          <Search className="w-4 h-4 text-[#647084] shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search PDFs by filename..."
            aria-label="Search PDFs"
            className="w-full min-h-[44px] bg-transparent text-sm outline-none text-[#1E2430] dark:text-[#F4F7FC]"
          />
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortMode)}
          aria-label="Sort documents"
          className="min-h-[44px] px-3.5 rounded-2xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] text-sm font-medium text-[#1E2430] dark:text-[#F4F7FC] outline-none focus:border-[#2563EB]"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="name">Name (A–Z)</option>
          <option value="size">Largest Size</option>
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F3F7FF] dark:bg-[#1E2B45] text-[#2563EB] flex items-center justify-center mx-auto">
            <FolderOpen className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold">
            {query ? 'No matching PDFs found' : 'Your Pinkora library is empty'}
          </h2>
          <p className="text-sm text-[#647084] dark:text-[#A8B3C7]">
            {query
              ? 'Try another search term or clear the search box.'
              : 'Create a PDF from photos or import existing PDFs from your device.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="rounded-2xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-[#2563EB]/60 transition-colors"
            >
              <button
                type="button"
                onClick={() => onOpenPdf(doc)}
                className="flex items-center gap-3.5 min-w-0 flex-1 text-left"
              >
                <div className="w-14 h-18 rounded-xl overflow-hidden bg-[#F3F7FF] dark:bg-[#212A3E] border border-[#D9E4F8] dark:border-[#27354F] shrink-0 flex items-center justify-center">
                  {doc.thumbnailDataUrl ? (
                    <img
                      src={doc.thumbnailDataUrl}
                      alt={`Preview of ${doc.name}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FileText className="w-6 h-6 text-[#2563EB]" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#1E2430] dark:text-[#F4F7FC] truncate">
                    {doc.name}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-[#647084] dark:text-[#A8B3C7] tabular-nums">
                    <span>
                      {doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'} ·{' '}
                      {formatBytes(doc.sizeBytes)}
                    </span>
                    {doc.isProtected && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-[#2563EB] dark:text-[#60A5FA] font-semibold">
                          <Lock className="w-3 h-3" />
                          <span>Locked</span>
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-[#8D97A8] dark:text-[#8E9BB0]">
                    Updated {formatShortDate(doc.updatedAt)}
                  </div>
                </div>
              </button>

              <div className="flex items-center gap-1.5 shrink-0 border-t sm:border-t-0 pt-2.5 sm:pt-0 border-[#EDF2FA] dark:border-[#27354F]">
                <button
                  type="button"
                  onClick={() => onSharePdf(doc)}
                  aria-label={`Share ${doc.name}`}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[#F3F7FF] dark:bg-[#1E2738] hover:bg-[#E0ECFF] text-[#2563EB]"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onSaveCopy(doc)}
                  aria-label={`Save copy of ${doc.name}`}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[#F3F7FF] dark:bg-[#1E2738] hover:bg-[#E0ECFF] text-[#1E2430] dark:text-white"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onRenamePdf(doc)}
                  aria-label={`Rename ${doc.name}`}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[#F3F7FF] dark:bg-[#1E2738] hover:bg-[#E0ECFF] text-[#647084] dark:text-[#A8B3C7]"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeletePdf(doc)}
                  aria-label={`Delete ${doc.name}`}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[#FDECEF] dark:bg-[#3A1E25] hover:bg-[#FAD6DF] text-[#D9364F]"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

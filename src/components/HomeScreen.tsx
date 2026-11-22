import React, { useState } from 'react';
import {
  ArrowRight,
  Camera,
  FilePlus2,
  FileText,
  Images,
  Lock,
  MoreVertical,
  Pencil,
  ScanLine,
  Settings as SettingsIcon,
  Share2,
  Trash2,
  Download,
} from 'lucide-react';
import { PdfDocumentRecord } from '../types/pinkora';
import { formatBytes, formatShortDate } from '../services/storage';
import { PinkoraLogo } from './PinkoraBrand';
import { PWAInstallButton } from './PWAInstallButton';

interface HomeScreenProps {
  recentDocuments: PdfDocumentRecord[];
  onGalleryToPdf: () => void;
  onScanDocument: () => void;
  onCreatePdf: () => void;
  onOpenMyFiles: () => void;
  onOpenSettings: () => void;
  onOpenPdf: (doc: PdfDocumentRecord) => void;
  onSharePdf: (doc: PdfDocumentRecord) => void;
  onSaveCopy: (doc: PdfDocumentRecord) => void;
  onRenamePdf: (doc: PdfDocumentRecord) => void;
  onDeletePdf: (doc: PdfDocumentRecord) => void;
}

export function HomeScreen({
  recentDocuments,
  onGalleryToPdf,
  onScanDocument,
  onCreatePdf,
  onOpenMyFiles,
  onOpenSettings,
  onOpenPdf,
  onSharePdf,
  onSaveCopy,
  onRenamePdf,
  onDeletePdf,
}: HomeScreenProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const topRecent = recentDocuments.slice(0, 6);

  return (
    <div className="space-y-8">
      {/* Clean Mobile Header */}
      <div className="flex items-center justify-between gap-3 md:hidden">
        <div className="flex items-center gap-2.5">
          <PinkoraLogo size={36} />
          <div>
            <div className="text-base font-extrabold tracking-tight text-[#1E2430] dark:text-[#F4F7FC]">
              Pinkora PDF
            </div>
            <div className="text-xs text-[#647084] dark:text-[#A8B3C7]">
              Created by Alok
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PWAInstallButton compact />
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open Settings"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] text-[#1E2430] dark:text-[#F4F7FC]"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Hero Greeting + Primary Capture Actions */}
      <section className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-5 sm:p-8 shadow-xs">
        <div className="max-w-2xl space-y-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1E2430] dark:text-[#F4F7FC] text-balance">
            Scan documents &amp; build clean PDFs locally
          </h1>
          <p className="text-sm sm:text-base text-[#647084] dark:text-[#A8B3C7] leading-relaxed">
            Built by Alok. Turn gallery photos or live camera scans into crisp, password-protected PDFs right in your browser.
          </p>
        </div>

        {/* 3 Core Action Cards */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onGalleryToPdf}
            className="group text-left rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white p-5 transition-all active:scale-[0.99] flex flex-col justify-between min-h-[132px]"
          >
            <div className="w-11 h-11 rounded-2xl bg-white/18 flex items-center justify-center">
              <Images className="w-5 h-5" />
            </div>
            <div className="mt-4">
              <div className="text-base font-bold">Gallery to PDF</div>
              <div className="mt-0.5 text-xs text-white/85">
                Pick one or multiple photos
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onScanDocument}
            className="group text-left rounded-2xl bg-[#F3F7FF] dark:bg-[#212A3E] hover:bg-[#E0ECFF] dark:hover:bg-[#27354F] border border-[#CFDCF4] dark:border-[#2E3C59] p-5 transition-all active:scale-[0.99] flex flex-col justify-between min-h-[132px]"
          >
            <div className="w-11 h-11 rounded-2xl bg-[#2563EB]/12 text-[#2563EB] flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div className="mt-4">
              <div className="text-base font-bold text-[#1E2430] dark:text-[#F4F7FC]">
                Scan Document
              </div>
              <div className="mt-0.5 text-xs text-[#647084] dark:text-[#A8B3C7]">
                Live camera with edge detection
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onCreatePdf}
            className="group text-left rounded-2xl bg-[#F3F7FF] dark:bg-[#212A3E] hover:bg-[#E0ECFF] dark:hover:bg-[#27354F] border border-[#CFDCF4] dark:border-[#2E3C59] p-5 transition-all active:scale-[0.99] flex flex-col justify-between min-h-[132px]"
          >
            <div className="w-11 h-11 rounded-2xl bg-[#2563EB]/12 text-[#2563EB] flex items-center justify-center">
              <FilePlus2 className="w-5 h-5" />
            </div>
            <div className="mt-4">
              <div className="text-base font-bold text-[#1E2430] dark:text-[#F4F7FC]">
                Create PDF
              </div>
              <div className="mt-0.5 text-xs text-[#647084] dark:text-[#A8B3C7]">
                Choose source &amp; configure pages
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* Recent PDFs */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[#1E2430] dark:text-[#F4F7FC]">
            Recent PDFs
          </h2>
          {recentDocuments.length > 0 && (
            <button
              type="button"
              onClick={onOpenMyFiles}
              className="min-h-[40px] px-3 rounded-xl text-sm font-semibold text-[#2563EB] hover:bg-[#E0ECFF] dark:hover:bg-[#1D2A44] inline-flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <span>View All ({recentDocuments.length})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {topRecent.length === 0 ? (
          <div className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-8 sm:p-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#F3F7FF] dark:bg-[#1E2B45] text-[#2563EB] flex items-center justify-center mx-auto">
              <ScanLine className="w-7 h-7" />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="text-base font-bold text-[#1E2430] dark:text-[#F4F7FC]">
                No saved PDFs yet
              </h3>
              <p className="text-sm text-[#647084] dark:text-[#A8B3C7]">
                Select photos from your gallery or scan a document to create your first PDF.
              </p>
            </div>
            <button
              type="button"
              onClick={onGalleryToPdf}
              className="min-h-[44px] px-5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Images className="w-4 h-4" />
              <span>Select Images</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {topRecent.map((doc) => {
              const menuOpen = openMenuId === doc.id;
              return (
                <div
                  key={doc.id}
                  className="relative rounded-2xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-3.5 flex items-center gap-3.5 hover:border-[#2563EB]/60 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onOpenPdf(doc)}
                    className="flex items-center gap-3.5 flex-1 min-w-0 text-left"
                  >
                    <div className="w-14 h-18 rounded-xl overflow-hidden bg-[#F3F7FF] dark:bg-[#212A3E] border border-[#D9E4F8] dark:border-[#27354F] shrink-0 flex items-center justify-center">
                      {doc.thumbnailDataUrl ? (
                        <img
                          src={doc.thumbnailDataUrl}
                          alt={`Thumbnail of ${doc.name}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileText className="w-6 h-6 text-[#2563EB]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
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
                            <Lock className="w-3 h-3 text-[#2563EB] shrink-0" aria-label="Password protected" />
                          </>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-[#8D97A8] dark:text-[#8E9BB0]">
                        {formatShortDate(doc.updatedAt)}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    aria-label={`Actions for ${doc.name}`}
                    onClick={() => setOpenMenuId(menuOpen ? null : doc.id)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-[#F3F7FF] dark:hover:bg-[#232E42] text-[#647084] dark:text-[#A8B3C7]"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {menuOpen && (
                    <div className="absolute right-3 top-14 z-20 w-44 rounded-2xl bg-white dark:bg-[#1E2738] border border-[#D9E4F8] dark:border-[#2D3B56] shadow-xl py-1.5 text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          onOpenPdf(doc);
                        }}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-[#F3F7FF] dark:hover:bg-[#27354F] flex items-center gap-2.5"
                      >
                        <FileText className="w-4 h-4 text-[#2563EB]" />
                        <span>Open PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          onSharePdf(doc);
                        }}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-[#F3F7FF] dark:hover:bg-[#27354F] flex items-center gap-2.5"
                      >
                        <Share2 className="w-4 h-4 text-[#2563EB]" />
                        <span>Share</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          onSaveCopy(doc);
                        }}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-[#F3F7FF] dark:hover:bg-[#27354F] flex items-center gap-2.5"
                      >
                        <Download className="w-4 h-4 text-[#647084]" />
                        <span>Save Copy</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          onRenamePdf(doc);
                        }}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-[#F3F7FF] dark:hover:bg-[#27354F] flex items-center gap-2.5"
                      >
                        <Pencil className="w-4 h-4 text-[#647084]" />
                        <span>Rename</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          onDeletePdf(doc);
                        }}
                        className="w-full px-3.5 py-2.5 text-left text-[#D9364F] hover:bg-[#FDECEF] dark:hover:bg-[#3A1E25] flex items-center gap-2.5"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

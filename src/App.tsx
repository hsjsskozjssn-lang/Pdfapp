import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  FolderOpen,
  Home,
  Images,
  Layers,
  ScanLine,
  Settings,
  Wrench,
  X,
} from 'lucide-react';
import {
  AppSettings,
  NavTab,
  PageItem,
  PdfDocumentRecord,
} from './types/pinkora';
import {
  clearAllDocuments,
  deleteDocument,
  listDocuments,
  loadSettings,
  renameDocument,
  saveDocument,
  saveSettings,
} from './services/storage';
import { createPageItemFromFile } from './services/imageProcessor';
import { sharePdfDocument } from './services/pdfEngine';
import {
  ConfirmModal,
  PinkoraLogo,
  RenameModal,
  ToastBanner,
  ToastMessage,
} from './components/PinkoraBrand';
import { HomeScreen } from './components/HomeScreen';
import { MyFilesScreen } from './components/MyFilesScreen';
import { ToolsScreen } from './components/ToolsScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { DocumentEditorWorkspace } from './components/DocumentEditorWorkspace';
import { CameraScannerModal } from './components/CameraScannerModal';
import { PdfViewerModal } from './components/PdfViewerModal';
import { SavePdfModal } from './components/SavePdfModal';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [documents, setDocuments] = useState<PdfDocumentRecord[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  // Active editor workspace state
  const [editorActive, setEditorActive] = useState(false);
  const [draftPages, setDraftPages] = useState<PageItem[]>([]);
  const [importingImages, setImportingImages] = useState(false);

  // Modals
  const [scannerOpen, setScannerOpen] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<PdfDocumentRecord | null>(null);
  const [saveTarget, setSaveTarget] = useState<PdfDocumentRecord | null>(null);
  const [renameTarget, setRenameTarget] = useState<PdfDocumentRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PdfDocumentRecord | null>(null);

  const [toast, setToast] = useState<ToastMessage | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const notify = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    setToast({ id: Date.now(), type, text });
  }, []);

  // Theme application (Light / Dark / System)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const isDark =
        settings.theme === 'dark' || (settings.theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', isDark);
    };
    applyTheme();
    mq.addEventListener('change', applyTheme);
    return () => mq.removeEventListener('change', applyTheme);
  }, [settings.theme]);

  const refreshDocuments = useCallback(async () => {
    try {
      const list = await listDocuments();
      setDocuments(list);
    } catch {
      notify('error', 'Could not read saved PDFs from local browser storage.');
    } finally {
      setLoadingDocs(false);
    }
  }, [notify]);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  const handleUpdateSettings = (next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const openGalleryPicker = () => {
    galleryInputRef.current?.click();
  };

  const handleGallerySelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    setImportingImages(true);
    const added: PageItem[] = [];
    const failed: string[] = [];

    for (const file of files) {
      try {
        const pageItem = await createPageItemFromFile(file);
        added.push(pageItem);
      } catch {
        failed.push(file.name);
      }
    }

    setImportingImages(false);

    if (added.length > 0) {
      setDraftPages((prev) => (editorActive ? [...prev, ...added] : added));
      setEditorActive(true);
      if (failed.length > 0) {
        notify(
          'info',
          `Added ${added.length} image(s). Skipped unsupported file(s): ${failed.join(', ')}`
        );
      }
    } else if (failed.length > 0) {
      notify('error', `Could not open selected image(s): ${failed.join(', ')}`);
    }
  };

  const handleScannerFinished = (scannedPages: PageItem[]) => {
    setScannerOpen(false);
    if (scannedPages.length === 0) return;
    setDraftPages((prev) => (editorActive ? [...prev, ...scannedPages] : scannedPages));
    setEditorActive(true);
  };

  const handleSaveNewDoc = async (doc: PdfDocumentRecord) => {
    await saveDocument(doc);
    await refreshDocuments();
  };

  const handleShareDoc = async (doc: PdfDocumentRecord) => {
    try {
      const res = await sharePdfDocument(doc.pdfBytes, doc.name);
      notify(
        'success',
        res === 'shared'
          ? `Shared "${doc.name}".`
          : `Downloaded "${doc.name}" (browser share sheet unavailable here).`
      );
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        notify('error', 'Failed to share PDF.');
      }
    }
  };

  const handleSaveCopy = (doc: PdfDocumentRecord) => {
    setSaveTarget(doc);
  };

  const handleConfirmRename = async (newName: string) => {
    if (!renameTarget) return;
    try {
      await renameDocument(renameTarget.id, newName);
      await refreshDocuments();
      notify('success', 'Document renamed.');
    } catch (err) {
      notify('error', (err as Error)?.message || 'Failed to rename document.');
    } finally {
      setRenameTarget(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDocument(deleteTarget.id);
      await refreshDocuments();
      notify('info', `Deleted "${deleteTarget.name}".`);
    } catch {
      notify('error', 'Failed to delete document.');
    } finally {
      setDeleteTarget(null);
    }
  };

  const totalStorageBytes = useMemo(
    () => documents.reduce((sum, d) => sum + d.sizeBytes, 0),
    [documents]
  );

  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'files', label: 'My Files', icon: FolderOpen },
    { id: 'tools', label: 'Tools', icon: Wrench },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#F3F7FF] dark:bg-[#111622] text-[#1E2430] dark:text-[#F4F7FC] flex flex-col md:flex-row">
      {/* Hidden System Photo Picker Input */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleGallerySelected}
      />

      {/* Desktop / Tablet Left Sidebar Rail */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white dark:bg-[#151B28] border-r border-[#D9E4F8] dark:border-[#27354F] px-4 py-6 z-30">
        <div className="flex items-center gap-3 px-2">
          <PinkoraLogo size={36} />
          <div className="min-w-0">
            <div className="text-base font-extrabold tracking-tight truncate">
              Pinkora PDF
            </div>
            <div className="text-[11px] text-[#647084] dark:text-[#A8B3C7]">
              Created by Alok
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="mt-6 min-h-[48px] w-full rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-colors"
        >
          <ScanLine className="w-4 h-4" />
          <span>Scan Document</span>
        </button>

        <nav aria-label="Main Navigation" className="mt-6 flex-1 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = !editorActive && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setEditorActive(false);
                  setActiveTab(item.id);
                }}
                className={`w-full min-h-[46px] px-3.5 rounded-2xl text-sm font-semibold flex items-center gap-3 transition-colors ${
                  active
                    ? 'bg-[#E0ECFF] dark:bg-[#1D2A44] text-[#1D4ED8] dark:text-[#60A5FA]'
                    : 'text-[#4A5568] dark:text-[#A8B3C7] hover:bg-[#F3F7FF] dark:hover:bg-[#1E2738]'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mb-3">
          <PWAInstallButton />
        </div>

        <div className="px-2 pt-4 border-t border-[#D9E4F8] dark:border-[#27354F] text-xs text-[#647084] dark:text-[#A8B3C7]">
          Made by Alok · 100% local
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 md:pl-64 pt-safe">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 pb-24 md:pb-10">
          {editorActive ? (
            <DocumentEditorWorkspace
              pages={draftPages}
              setPages={setDraftPages}
              settings={settings}
              existingFilenames={documents.map((d) => d.name)}
              onAddFromGallery={openGalleryPicker}
              onAddFromCamera={() => setScannerOpen(true)}
              onSaveDocument={handleSaveNewDoc}
              onOpenViewer={(doc) => setViewerDoc(doc)}
              onSaveCopy={handleSaveCopy}
              onRenameSavedDoc={(doc) => setRenameTarget(doc)}
              onExitToHome={() => {
                setEditorActive(false);
                setDraftPages([]);
                setActiveTab('home');
              }}
              onNotify={notify}
            />
          ) : (
            <>
              {activeTab === 'home' && (
                <HomeScreen
                  recentDocuments={documents}
                  onGalleryToPdf={openGalleryPicker}
                  onScanDocument={() => setScannerOpen(true)}
                  onCreatePdf={() => setSourcePickerOpen(true)}
                  onOpenMyFiles={() => setActiveTab('files')}
                  onOpenSettings={() => setActiveTab('settings')}
                  onOpenPdf={(doc) => setViewerDoc(doc)}
                  onSharePdf={handleShareDoc}
                  onSaveCopy={handleSaveCopy}
                  onRenamePdf={(doc) => setRenameTarget(doc)}
                  onDeletePdf={(doc) => setDeleteTarget(doc)}
                />
              )}

              {activeTab === 'files' && (
                <MyFilesScreen
                  documents={documents}
                  onRefresh={refreshDocuments}
                  onImportPdf={handleSaveNewDoc}
                  onOpenPdf={(doc) => setViewerDoc(doc)}
                  onSharePdf={handleShareDoc}
                  onSaveCopy={handleSaveCopy}
                  onRenamePdf={(doc) => setRenameTarget(doc)}
                  onDeletePdf={(doc) => setDeleteTarget(doc)}
                  onCreateNewPdf={() => setSourcePickerOpen(true)}
                  onNotify={notify}
                />
              )}

              {activeTab === 'tools' && (
                <ToolsScreen
                  documents={documents}
                  onImagesToPdf={openGalleryPicker}
                  onSaveResult={handleSaveNewDoc}
                  onOpenViewer={(doc) => setViewerDoc(doc)}
                  onNotify={notify}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsScreen
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  documentCount={documents.length}
                  totalStorageBytes={totalStorageBytes}
                  onClearAllDocuments={async () => {
                    await clearAllDocuments();
                    await refreshDocuments();
                    notify('info', 'All locally saved PDFs cleared.');
                  }}
                />
              )}
            </>
          )}

          {loadingDocs && !editorActive && activeTab === 'home' && documents.length === 0 && (
            <p className="sr-only">Loading local PDF library...</p>
          )}
        </div>
      </main>

      {/* Mobile Fixed Bottom Navigation Bar */}
      {!editorActive && (
        <nav
          aria-label="Bottom Navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#151B28]/95 backdrop-blur-md border-t border-[#D9E4F8] dark:border-[#27354F] pb-safe"
        >
          <div className="grid grid-cols-4 h-16">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                    active
                      ? 'text-[#2563EB] dark:text-[#60A5FA]'
                      : 'text-[#647084] dark:text-[#A8B3C7]'
                  }`}
                >
                  <div
                    className={`px-3.5 py-1 rounded-full transition-colors ${
                      active ? 'bg-[#E0ECFF] dark:bg-[#1D2A44]' : ''
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-semibold tracking-tight leading-none">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Create PDF Source Picker Sheet */}
      {sourcePickerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose PDF Source"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs"
        >
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-6 pb-safe space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Create a New PDF</h2>
              <button
                type="button"
                onClick={() => setSourcePickerOpen(false)}
                aria-label="Close"
                className="p-2 rounded-xl hover:bg-[#F3F7FF] dark:hover:bg-[#1E2738]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setSourcePickerOpen(false);
                  openGalleryPicker();
                }}
                className="w-full min-h-[60px] p-4 rounded-2xl bg-[#F3F7FF] dark:bg-[#1E2738] hover:bg-[#E0ECFF] flex items-center gap-3.5 text-left transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shrink-0">
                  <Images className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold">Gallery Photos</div>
                  <div className="text-xs text-[#647084] dark:text-[#A8B3C7]">
                    Select one or multiple images from your device
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourcePickerOpen(false);
                  setScannerOpen(true);
                }}
                className="w-full min-h-[60px] p-4 rounded-2xl bg-[#F3F7FF] dark:bg-[#1E2738] hover:bg-[#E0ECFF] flex items-center gap-3.5 text-left transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shrink-0">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold">Camera Scanner</div>
                  <div className="text-xs text-[#647084] dark:text-[#A8B3C7]">
                    Capture physical documents with auto edge detection
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSourcePickerOpen(false);
                  setEditorActive(false);
                  setActiveTab('tools');
                }}
                className="w-full min-h-[60px] p-4 rounded-2xl bg-[#F3F7FF] dark:bg-[#1E2738] hover:bg-[#E0ECFF] flex items-center gap-3.5 text-left transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-[#E0ECFF] dark:bg-[#1D2A44] text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold">Merge or Edit Existing PDFs</div>
                  <div className="text-xs text-[#647084] dark:text-[#A8B3C7]">
                    Combine, split, extract, lock, or compress saved PDFs
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Import Loading Overlay */}
      {importingImages && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="rounded-3xl bg-white dark:bg-[#181F2E] px-6 py-5 shadow-xl text-center space-y-2">
            <div className="text-sm font-bold">Preparing Images...</div>
            <p className="text-xs text-[#647084] dark:text-[#A8B3C7]">
              Detecting document edges &amp; building preview
            </p>
          </div>
        </div>
      )}

      {/* Camera Scanner Modal */}
      <CameraScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onFinishPages={handleScannerFinished}
        onOpenGalleryInstead={openGalleryPicker}
      />

      {/* PDF Viewer Modal */}
      <PdfViewerModal
        documentRecord={viewerDoc}
        onClose={() => setViewerDoc(null)}
        onRequestSaveCopy={(doc) => setSaveTarget(doc)}
        onNotify={notify}
      />

      {/* Save PDF / Password Protection Modal */}
      <SavePdfModal
        documentRecord={saveTarget}
        onClose={() => setSaveTarget(null)}
        onSaveLockedToLibrary={handleSaveNewDoc}
        onNotify={notify}
      />

      {/* Rename Modal */}
      <RenameModal
        open={Boolean(renameTarget)}
        initialName={renameTarget?.name ?? ''}
        onSave={handleConfirmRename}
        onCancel={() => setRenameTarget(null)}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete PDF?"
        message={`"${deleteTarget?.name ?? ''}" will be permanently removed from your local Pinkora PDF library.`}
        confirmLabel="Delete PDF"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Offline Indicator & Toast Notifications */}
      <OfflineIndicator />
      <ToastBanner toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

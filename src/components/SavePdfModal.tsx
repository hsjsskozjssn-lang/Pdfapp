import React, { useEffect, useState } from 'react';
import { Download, Eye, EyeOff, Lock, X } from 'lucide-react';
import { PdfDocumentRecord } from '../types/pinkora';
import { encryptPdfBytes, savePdfToDevice } from '../services/pdfEngine';
import { formatBytes, sanitizeFilename } from '../services/storage';

interface SavePdfModalProps {
  documentRecord: PdfDocumentRecord | null;
  onClose: () => void;
  onSaveLockedToLibrary?: (lockedDoc: PdfDocumentRecord) => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function SavePdfModal({
  documentRecord,
  onClose,
  onSaveLockedToLibrary,
  onNotify,
}: SavePdfModalProps) {
  const [filename, setFilename] = useState('');
  const [protectEnabled, setProtectEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!documentRecord) return;
    setFilename(documentRecord.name.replace(/\.pdf$/i, ''));
    setProtectEnabled(false);
    setPassword('');
    setShowPassword(false);
    setSaveToLibrary(true);
    setErrorMsg('');
  }, [documentRecord]);

  if (!documentRecord) return null;

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (protectEnabled && password.trim().length === 0) {
      setErrorMsg('Enter a password or turn off password protection.');
      return;
    }

    setSaving(true);
    try {
      const cleanName = sanitizeFilename(filename || documentRecord.name);
      let bytesToSave = documentRecord.pdfBytes;

      if (protectEnabled && password.trim().length > 0) {
        if (documentRecord.isProtected) {
          throw new Error(
            'This PDF is already password-protected. Download it directly or unlock it first.'
          );
        }
        const encrypted = await encryptPdfBytes(documentRecord.pdfBytes, password.trim());
        bytesToSave = encrypted.pdfBytes;

        if (saveToLibrary && onSaveLockedToLibrary) {
          const now = Date.now();
          await onSaveLockedToLibrary({
            id: `doc_${now}_${Math.random().toString(36).slice(2, 8)}`,
            name: cleanName.replace(/\.pdf$/i, '_locked.pdf'),
            createdAt: now,
            updatedAt: now,
            pageCount: encrypted.pageCount,
            sizeBytes: encrypted.pdfBytes.byteLength,
            thumbnailDataUrl: encrypted.thumbnailDataUrl || documentRecord.thumbnailDataUrl,
            pdfBytes: encrypted.pdfBytes,
            isProtected: true,
          });
        }
      }

      await savePdfToDevice(bytesToSave, cleanName);
      onNotify(
        'success',
        protectEnabled
          ? `Downloaded password-protected "${cleanName}".`
          : `Downloaded "${cleanName}".`
      );
      onClose();
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setSaving(false);
        return;
      }
      setErrorMsg((err as Error)?.message || 'Could not save PDF to device.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Save PDF to Device"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
    >
      <form
        onSubmit={handleDownload}
        className="w-full max-w-md rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-6 shadow-xl space-y-5"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-[#1E2430] dark:text-[#F4F7FC]">
              Save PDF to Device
            </h2>
            <p className="text-xs text-[#647084] dark:text-[#A8B3C7] tabular-nums">
              {documentRecord.pageCount} {documentRecord.pageCount === 1 ? 'page' : 'pages'} ·{' '}
              {formatBytes(documentRecord.sizeBytes)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-xl hover:bg-[#F3F7FF] dark:hover:bg-[#1E2738]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* File name */}
        <div className="space-y-1.5">
          <label
            htmlFor="save-pdf-name"
            className="block text-xs font-semibold text-[#647084] dark:text-[#A8B3C7]"
          >
            File Name
          </label>
          <div className="flex items-center rounded-xl border border-[#CFDCF4] dark:border-[#27354F] bg-[#F8FAFF] dark:bg-[#111622] px-3 focus-within:border-[#2563EB]">
            <input
              id="save-pdf-name"
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              maxLength={90}
              className="w-full min-h-[44px] bg-transparent text-sm font-medium outline-none"
            />
            <span className="text-xs font-mono text-[#647084] pl-2 shrink-0">.pdf</span>
          </div>
        </div>

        {/* Password protection toggle */}
        {!documentRecord.isProtected ? (
          <div className="rounded-2xl bg-[#F3F7FF] dark:bg-[#1E2738] p-4 space-y-3">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-[#2563EB] shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-[#1E2430] dark:text-[#F4F7FC]">
                    Set Password (AES-256)
                  </div>
                  <div className="text-xs text-[#647084] dark:text-[#A8B3C7]">
                    Encrypt PDF to keep it safe before saving
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={protectEnabled}
                onChange={(e) => {
                  setProtectEnabled(e.target.checked);
                  setErrorMsg('');
                }}
                className="w-5 h-5 accent-[#2563EB] rounded cursor-pointer"
              />
            </label>

            {protectEnabled && (
              <div className="space-y-2.5">
                <div className="flex items-center rounded-xl border border-[#CFDCF4] dark:border-[#27354F] bg-white dark:bg-[#111622] px-3 focus-within:border-[#2563EB]">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password to lock PDF"
                    autoFocus
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

                {onSaveLockedToLibrary && (
                  <label className="flex items-center gap-2.5 text-xs text-[#647084] dark:text-[#A8B3C7] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveToLibrary}
                      onChange={(e) => setSaveToLibrary(e.target.checked)}
                      className="w-4 h-4 accent-[#2563EB] rounded"
                    />
                    <span>Also keep locked copy saved in My Files</span>
                  </label>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-[#F3F7FF] dark:bg-[#1E2738] p-3.5 flex items-center gap-2.5 text-xs text-[#647084] dark:text-[#A8B3C7]">
            <Lock className="w-4 h-4 text-[#2563EB] shrink-0" />
            <span>This PDF is already encrypted with a password.</span>
          </div>
        )}

        {errorMsg && (
          <p className="text-xs font-medium text-[#D9364F]">{errorMsg}</p>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-xl bg-[#EDF2FA] dark:bg-[#232E42] text-sm font-semibold text-[#1E2430] dark:text-[#F4F7FC]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>{saving ? 'Encrypting...' : 'Download PDF'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

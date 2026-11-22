import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export function PinkoraLogo({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="40" height="40" rx="11" fill="#2563EB" />
      <path
        d="M13 10.5H23.2L28.5 15.8V28.5C28.5 29.6 27.6 30.5 26.5 30.5H13C11.9 30.5 11 29.6 11 28.5V12.5C11 11.4 11.9 10.5 13 10.5Z"
        fill="#FFFFFF"
      />
      <path d="M23 10.5V15.5C23 16.05 23.45 16.5 24 16.5H28.5" fill="#BFDBFE" />
      <rect x="14.5" y="19.5" width="10.5" height="2" rx="1" fill="#2563EB" />
      <rect x="14.5" y="23.5" width="7.5" height="2" rx="1" fill="#60A5FA" />
    </svg>
  );
}

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}

export function ToastBanner({
  toast,
  onDismiss,
}: {
  toast: ToastMessage | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onDismiss, 3600);
    return () => window.clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const Icon =
    toast.type === 'success'
      ? CheckCircle2
      : toast.type === 'error'
        ? AlertCircle
        : Info;

  const colors =
    toast.type === 'success'
      ? 'bg-[#1FA971] text-white'
      : toast.type === 'error'
        ? 'bg-[#D9364F] text-white'
        : 'bg-[#1E2430] text-white dark:bg-[#232D42]';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,440px)] pointer-events-auto"
    >
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg ${colors}`}
      >
        <Icon className="w-5 h-5 shrink-0" />
        <span className="text-sm font-medium flex-1 leading-snug">{toast.text}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="p-1 rounded-lg hover:bg-white/15 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-6 shadow-xl">
        <h3
          id="confirm-modal-title"
          className="text-lg font-bold text-[#1E2430] dark:text-[#F4F7FC]"
        >
          {title}
        </h3>
        <p className="mt-2 text-sm text-[#647084] dark:text-[#A8B3C7] leading-relaxed">
          {message}
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 rounded-xl bg-[#EDF2FA] dark:bg-[#232E42] text-sm font-semibold text-[#1E2430] dark:text-[#F4F7FC] hover:bg-[#E1E9F7] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[44px] px-5 rounded-xl text-sm font-semibold text-white transition-colors ${
              destructive
                ? 'bg-[#D9364F] hover:bg-[#BE283F]'
                : 'bg-[#2563EB] hover:bg-[#1D4ED8]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RenameModal({
  open,
  initialName,
  onSave,
  onCancel,
}: {
  open: boolean;
  initialName: string;
  onSave: (newName: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialName.replace(/\.pdf$/i, ''));

  useEffect(() => {
    setValue(initialName.replace(/\.pdf$/i, ''));
  }, [initialName, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    onSave(value.trim());
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-6 shadow-xl"
      >
        <h3
          id="rename-modal-title"
          className="text-lg font-bold text-[#1E2430] dark:text-[#F4F7FC]"
        >
          Rename Document
        </h3>
        <div className="mt-4 flex items-center rounded-xl border border-[#CFDCF4] dark:border-[#27354F] bg-[#F8FAFF] dark:bg-[#111622] px-3 focus-within:border-[#2563EB]">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            maxLength={90}
            aria-label="Document name"
            className="w-full min-h-[44px] bg-transparent text-sm text-[#1E2430] dark:text-[#F4F7FC] outline-none"
          />
          <span className="text-xs font-mono text-[#647084] pl-2 shrink-0">.pdf</span>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 rounded-xl bg-[#EDF2FA] dark:bg-[#232E42] text-sm font-semibold text-[#1E2430] dark:text-[#F4F7FC]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="min-h-[44px] px-5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-45 text-sm font-semibold text-white"
          >
            Save Name
          </button>
        </div>
      </form>
    </div>
  );
}

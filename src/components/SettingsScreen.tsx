import React, { useState } from 'react';
import { Monitor, Moon, Sun, Trash2 } from 'lucide-react';
import {
  AppSettings,
  ImageFitMode,
  PageOrientation,
  PageSizeOption,
  QualityPreset,
  ThemePreference,
} from '../types/pinkora';
import { formatBytes } from '../services/storage';
import { ConfirmModal } from './PinkoraBrand';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsScreenProps {
  settings: AppSettings;
  onUpdateSettings: (next: AppSettings) => void;
  documentCount: number;
  totalStorageBytes: number;
  onClearAllDocuments: () => Promise<void>;
}

export function SettingsScreen({
  settings,
  onUpdateSettings,
  documentCount,
  totalStorageBytes,
  onClearAllDocuments,
}: SettingsScreenProps) {
  const [confirmClear, setConfirmClear] = useState(false);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onUpdateSettings({ ...settings, [key]: value });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#1E2430] dark:text-[#F4F7FC]">
          Settings
        </h1>
        <p className="text-xs sm:text-sm text-[#647084] dark:text-[#A8B3C7]">
          Configure appearance, default PDF export options, and local library storage.
        </p>
      </div>

      {/* Appearance */}
      <section className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-5 space-y-3">
        <h2 className="text-sm font-bold">Appearance</h2>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: 'light', label: 'Light', icon: Sun },
              { id: 'dark', label: 'Dark', icon: Moon },
              { id: 'system', label: 'System', icon: Monitor },
            ] as const
          ).map((opt) => {
            const Icon = opt.icon;
            const active = settings.theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => update('theme', opt.id as ThemePreference)}
                className={`min-h-[46px] px-3 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                  active
                    ? 'bg-[#2563EB] text-white'
                    : 'bg-[#F3F7FF] dark:bg-[#1E2738] text-[#1E2430] dark:text-[#F4F7FC] hover:bg-[#E0ECFF]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Default PDF Settings */}
      <section className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-5 space-y-4">
        <h2 className="text-sm font-bold">Default PDF Export</h2>

        <div className="space-y-1.5">
          <label
            htmlFor="default-prefix-input"
            className="block text-xs font-semibold text-[#647084] dark:text-[#A8B3C7]"
          >
            Default Filename Prefix
          </label>
          <input
            id="default-prefix-input"
            type="text"
            value={settings.filenamePrefix}
            onChange={(e) => update('filenamePrefix', e.target.value)}
            maxLength={40}
            className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#CFDCF4] dark:border-[#27354F] bg-[#F8FAFF] dark:bg-[#111622] text-sm font-medium outline-none focus:border-[#2563EB]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="default-pagesize-select"
              className="block text-xs font-semibold text-[#647084] dark:text-[#A8B3C7]"
            >
              Default Page Size
            </label>
            <select
              id="default-pagesize-select"
              value={settings.defaultPageSize}
              onChange={(e) => update('defaultPageSize', e.target.value as PageSizeOption)}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#CFDCF4] dark:border-[#27354F] bg-[#F8FAFF] dark:bg-[#111622] text-sm font-medium outline-none"
            >
              <option value="a4">A4</option>
              <option value="letter">US Letter</option>
              <option value="original">Original Image Size</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="default-orientation-select"
              className="block text-xs font-semibold text-[#647084] dark:text-[#A8B3C7]"
            >
              Default Orientation
            </label>
            <select
              id="default-orientation-select"
              value={settings.defaultOrientation}
              onChange={(e) => update('defaultOrientation', e.target.value as PageOrientation)}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#CFDCF4] dark:border-[#27354F] bg-[#F8FAFF] dark:bg-[#111622] text-sm font-medium outline-none"
            >
              <option value="auto">Auto (Match Image)</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="default-fit-select"
              className="block text-xs font-semibold text-[#647084] dark:text-[#A8B3C7]"
            >
              Default Image Fit
            </label>
            <select
              id="default-fit-select"
              value={settings.defaultFitMode}
              onChange={(e) => update('defaultFitMode', e.target.value as ImageFitMode)}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#CFDCF4] dark:border-[#27354F] bg-[#F8FAFF] dark:bg-[#111622] text-sm font-medium outline-none"
            >
              <option value="margins">White Margins</option>
              <option value="fit">Fit Ratio</option>
              <option value="fill">Fill Page</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="default-quality-select"
              className="block text-xs font-semibold text-[#647084] dark:text-[#A8B3C7]"
            >
              Default Quality
            </label>
            <select
              id="default-quality-select"
              value={settings.defaultQuality}
              onChange={(e) => update('defaultQuality', e.target.value as QualityPreset)}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#CFDCF4] dark:border-[#27354F] bg-[#F8FAFF] dark:bg-[#111622] text-sm font-medium outline-none"
            >
              <option value="high">High</option>
              <option value="balanced">Balanced</option>
              <option value="compact">Compact</option>
            </select>
          </div>
        </div>
      </section>

      {/* Local Storage */}
      <section className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">Local Document Storage</h2>
            <p className="mt-0.5 text-xs text-[#647084] dark:text-[#A8B3C7] tabular-nums">
              {documentCount} saved {documentCount === 1 ? 'PDF' : 'PDFs'} ·{' '}
              {formatBytes(totalStorageBytes)} used in IndexedDB
            </p>
          </div>

          <button
            type="button"
            disabled={documentCount === 0}
            onClick={() => setConfirmClear(true)}
            className="min-h-[44px] px-4 rounded-xl bg-[#FDECEF] dark:bg-[#3A1E25] hover:bg-[#FAD6DF] disabled:opacity-40 text-xs sm:text-sm font-semibold text-[#D9364F] inline-flex items-center gap-2 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear All PDFs</span>
          </button>
        </div>

        <p className="text-xs text-[#647084] dark:text-[#A8B3C7] leading-relaxed">
          All scans, edits, and generated PDFs stay 100% locally in your browser without uploading files to any server.
        </p>
      </section>

      {/* Install & Attribution */}
      <section className="rounded-3xl bg-white dark:bg-[#181F2E] border border-[#D9E4F8] dark:border-[#27354F] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">Pinkora PDF App</h2>
            <p className="mt-0.5 text-xs text-[#647084] dark:text-[#A8B3C7]">
              Created by Alok · Offline-ready PWA
            </p>
          </div>
          <div className="w-full sm:w-auto">
            <PWAInstallButton compact />
          </div>
        </div>
      </section>

      <ConfirmModal
        open={confirmClear}
        title="Clear All Saved PDFs?"
        message="This will permanently delete all locally stored PDFs from Pinkora PDF. Any copies already exported to your device downloads folder will remain safe."
        confirmLabel="Clear Library"
        onConfirm={async () => {
          setConfirmClear(false);
          await onClearAllDocuments();
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

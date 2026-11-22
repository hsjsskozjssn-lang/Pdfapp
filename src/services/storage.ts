import { AppSettings, PdfDocumentRecord } from '../types/pinkora';

const DB_NAME = 'pinkora_pdf_db';
const DB_VERSION = 1;
const STORE_NAME = 'documents';
const SETTINGS_KEY = 'pinkora_pdf_settings_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  defaultPageSize: 'a4',
  defaultOrientation: 'auto',
  defaultFitMode: 'margins',
  defaultQuality: 'balanced',
  filenamePrefix: 'Pinkora_Scan',
};

interface StoredDocRow {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pageCount: number;
  sizeBytes: number;
  thumbnailDataUrl: string;
  pdfBuffer: ArrayBuffer;
  isProtected?: boolean;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open local library'));
  });
}

function toRecord(row: StoredDocRow): PdfDocumentRecord {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    pageCount: row.pageCount,
    sizeBytes: row.sizeBytes,
    thumbnailDataUrl: row.thumbnailDataUrl,
    pdfBytes: new Uint8Array(row.pdfBuffer),
    isProtected: Boolean(row.isProtected),
  };
}

export async function listDocuments(): Promise<PdfDocumentRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result as StoredDocRow[]) ?? [];
      rows.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(rows.map(toRecord));
    };
    req.onerror = () => reject(req.error ?? new Error('Failed to read saved PDFs'));
  });
}

export async function saveDocument(record: PdfDocumentRecord): Promise<void> {
  const db = await openDatabase();
  const copy = new Uint8Array(record.pdfBytes);
  const row: StoredDocRow = {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    pageCount: record.pageCount,
    sizeBytes: record.sizeBytes,
    thumbnailDataUrl: record.thumbnailDataUrl,
    pdfBuffer: copy.buffer,
    isProtected: Boolean(record.isProtected),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(row);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Failed to save PDF locally'));
  });
}

export async function renameDocument(id: string, newName: string): Promise<void> {
  const clean = sanitizeFilename(newName);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const row = getReq.result as StoredDocRow | undefined;
      if (!row) {
        reject(new Error('Document not found.'));
        return;
      }
      row.name = clean;
      row.updatedAt = Date.now();
      const putReq = store.put(row);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error ?? new Error('Failed to rename PDF'));
    };
    getReq.onerror = () => reject(getReq.error ?? new Error('Failed to access PDF'));
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Failed to delete PDF'));
  });
}

export async function clearAllDocuments(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Failed to clear local library'));
  });
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function sanitizeFilename(raw: string): string {
  const stripped = raw
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\.pdf$/i, '')
    .trim();
  const base = stripped.length > 0 ? stripped : 'Pinkora_Document';
  return `${base}.pdf`;
}

export function ensureUniqueFilename(baseName: string, existingNames: string[]): string {
  const clean = sanitizeFilename(baseName);
  const lowerSet = new Set(existingNames.map((n) => n.toLowerCase()));
  if (!lowerSet.has(clean.toLowerCase())) return clean;

  const stem = clean.replace(/\.pdf$/i, '');
  let counter = 2;
  while (lowerSet.has(`${stem}_${counter}.pdf`.toLowerCase())) {
    counter++;
  }
  return `${stem}_${counter}.pdf`;
}

export function generateDefaultFilename(prefix: string, existingNames: string[]): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const cleanPrefix = prefix.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'Pinkora_Scan';
  return ensureUniqueFilename(`${cleanPrefix}_${y}-${m}-${d}.pdf`, existingNames);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

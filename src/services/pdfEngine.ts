import { PDFDocument, StandardFonts, degrees, rgb } from '@cantoo/pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  PageItem,
  PdfGenerationOptions,
  PdfMetadataInfo,
  QualityPreset,
} from '../types/pinkora';
import { loadImageElement } from './imageProcessor';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const A4_PT = { w: 595.28, h: 841.89 };
const LETTER_PT = { w: 612, h: 792 };

function qualityToJpegLevel(preset: QualityPreset): number {
  switch (preset) {
    case 'high':
      return 0.92;
    case 'balanced':
      return 0.78;
    case 'compact':
      return 0.56;
  }
}

async function dataUrlToJpegBytes(dataUrl: string, jpegQuality: number): Promise<{
  bytes: Uint8Array;
  width: number;
  height: number;
}> {
  const img = await loadImageElement(dataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode page image.'))),
      'image/jpeg',
      jpegQuality
    );
  });
  const ab = await blob.arrayBuffer();
  return { bytes: new Uint8Array(ab), width: w, height: h };
}

export async function createPdfFromPages(
  pages: PageItem[],
  options: PdfGenerationOptions,
  onProgress?: (current: number, total: number) => void,
  signal?: AbortSignal
): Promise<{
  pdfBytes: Uint8Array;
  thumbnailDataUrl: string;
  pageCount: number;
  isProtected: boolean;
}> {
  if (pages.length === 0) {
    throw new Error('Select or scan at least one page before creating a PDF.');
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(options.filename.replace(/\.pdf$/i, ''));
  pdfDoc.setCreator('Pinkora PDF');
  pdfDoc.setProducer('Pinkora PDF Document Engine');
  pdfDoc.setCreationDate(new Date());

  const jpegQuality = qualityToJpegLevel(options.quality);

  const cleanWatermark = options.watermarkText?.trim() || '';
  const shouldDrawOverlay = Boolean(options.addPageNumbers) || cleanWatermark.length > 0;
  const overlayFont = shouldDrawOverlay
    ? await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    : null;
  const regularFont = options.addPageNumbers
    ? await pdfDoc.embedFont(StandardFonts.Helvetica)
    : null;

  for (let i = 0; i < pages.length; i++) {
    if (signal?.aborted) {
      throw new DOMException('PDF generation was cancelled.', 'AbortError');
    }

    const item = pages[i];
    const { bytes, width: imgW, height: imgH } = await dataUrlToJpegBytes(
      item.processedDataUrl,
      jpegQuality
    );
    const embedded = await pdfDoc.embedJpg(bytes);

    let pageW: number;
    let pageH: number;

    if (options.pageSize === 'original') {
      const scale = Math.min(1, 842 / Math.max(imgW, imgH));
      pageW = Math.max(100, imgW * scale);
      pageH = Math.max(100, imgH * scale);
      if (options.orientation === 'landscape' && pageH > pageW) {
        [pageW, pageH] = [pageH, pageW];
      } else if (options.orientation === 'portrait' && pageW > pageH) {
        [pageW, pageH] = [pageH, pageW];
      }
    } else {
      const base = options.pageSize === 'letter' ? LETTER_PT : A4_PT;
      const isLandscape =
        options.orientation === 'landscape' ||
        (options.orientation === 'auto' && imgW > imgH);
      pageW = isLandscape ? base.h : base.w;
      pageH = isLandscape ? base.w : base.h;
    }

    const page = pdfDoc.addPage([pageW, pageH]);
    const margin = options.fitMode === 'margins' ? 28 : 0;
    const availW = Math.max(10, pageW - margin * 2);
    const availH = Math.max(10, pageH - margin * 2);

    const imgRatio = imgW / imgH;
    const boxRatio = availW / availH;

    let drawW: number;
    let drawH: number;

    if (options.fitMode === 'fill') {
      if (imgRatio > boxRatio) {
        drawH = availH;
        drawW = drawH * imgRatio;
      } else {
        drawW = availW;
        drawH = drawW / imgRatio;
      }
    } else {
      if (imgRatio > boxRatio) {
        drawW = availW;
        drawH = drawW / imgRatio;
      } else {
        drawH = availH;
        drawW = drawH * imgRatio;
      }
    }

    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    page.drawImage(embedded, { x, y, width: drawW, height: drawH });

    if (cleanWatermark && overlayFont) {
      const wmSize = Math.max(22, Math.min(48, Math.round(pageW * 0.08)));
      const textWidth = overlayFont.widthOfTextAtSize(cleanWatermark, wmSize);
      page.drawText(cleanWatermark, {
        x: Math.max(24, (pageW - textWidth * 0.78) / 2),
        y: pageH * 0.44,
        size: wmSize,
        font: overlayFont,
        color: rgb(0.15, 0.39, 0.92),
        opacity: 0.16,
        rotate: degrees(32),
      });
    }

    if (options.addPageNumbers && regularFont) {
      const label = `${i + 1} / ${pages.length}`;
      const fontSize = 9.5;
      const lw = regularFont.widthOfTextAtSize(label, fontSize);
      page.drawText(label, {
        x: (pageW - lw) / 2,
        y: 11,
        size: fontSize,
        font: regularFont,
        color: rgb(0.32, 0.37, 0.46),
        opacity: 0.85,
      });
    }

    onProgress?.(i + 1, pages.length);
  }

  if (signal?.aborted) {
    throw new DOMException('PDF generation was cancelled.', 'AbortError');
  }

  const cleanPassword = options.password?.trim() || '';
  const isProtected = cleanPassword.length > 0;
  if (isProtected) {
    pdfDoc.encrypt({
      userPassword: cleanPassword,
      ownerPassword: cleanPassword,
      algorithm: 'AES-256',
      permissions: {
        printing: 'highResolution',
        modifying: false,
        copying: true,
        annotating: true,
        fillingForms: true,
        contentAccessibility: true,
        documentAssembly: false,
      },
    });
  }

  const pdfBytes = await pdfDoc.save();
  if (!pdfBytes || pdfBytes.byteLength < 100) {
    throw new Error('Generated PDF verification failed.');
  }

  const thumbnailDataUrl = await generatePdfThumbnail(pdfBytes, 320, cleanPassword || undefined).catch(
    () => pages[0].processedDataUrl
  );
  return {
    pdfBytes,
    thumbnailDataUrl,
    pageCount: pdfDoc.getPageCount(),
    isProtected,
  };
}

export async function encryptPdfBytes(
  pdfBytes: Uint8Array,
  password: string,
  existingPassword?: string
): Promise<{ pdfBytes: Uint8Array; pageCount: number; thumbnailDataUrl: string }> {
  const cleanPassword = password.trim();
  if (!cleanPassword) {
    throw new Error('Enter a non-empty password.');
  }
  const doc = await PDFDocument.load(pdfBytes.slice(), {
    password: existingPassword || undefined,
  });
  doc.encrypt({
    userPassword: cleanPassword,
    ownerPassword: cleanPassword,
    algorithm: 'AES-256',
    permissions: {
      printing: 'highResolution',
      modifying: false,
      copying: true,
      annotating: true,
      fillingForms: true,
      contentAccessibility: true,
      documentAssembly: false,
    },
  });
  const encryptedBytes = await doc.save();
  const thumbnailDataUrl = await generatePdfThumbnail(encryptedBytes, 320, cleanPassword).catch(
    () => ''
  );
  return {
    pdfBytes: encryptedBytes,
    pageCount: doc.getPageCount(),
    thumbnailDataUrl,
  };
}

export async function generatePdfThumbnail(
  pdfBytes: Uint8Array,
  maxWidth = 320,
  password?: string
): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(), password });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(1);
    const viewport1 = page.getViewport({ scale: 1 });
    const scale = maxWidth / viewport1.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    await loadingTask.destroy();
  }
}

export async function renderPdfPageToCanvas(
  pdfDocProxy: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<{ width: number; height: number }> {
  const page = await pdfDocProxy.getPage(pageNumber);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: scale * dpr });
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return {
    width: Math.floor(viewport.width / dpr),
    height: Math.floor(viewport.height / dpr),
  };
}

export async function openPdfProxy(
  pdfBytes: Uint8Array,
  password?: string
): Promise<pdfjsLib.PDFDocumentProxy> {
  if (!pdfBytes || pdfBytes.byteLength === 0) {
    throw new Error('This PDF file is empty.');
  }
  const task = pdfjsLib.getDocument({ data: pdfBytes.slice(), password });
  return task.promise;
}

export async function renderAllPdfThumbnails(
  pdfBytes: Uint8Array,
  thumbWidth = 180
): Promise<string[]> {
  const pdf = await openPdfProxy(pdfBytes);
  const thumbs: string[] = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: thumbWidth / vp1.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
      thumbs.push(canvas.toDataURL('image/jpeg', 0.76));
    }
    return thumbs;
  } finally {
    await pdf.loadingTask.destroy();
  }
}

export async function renderPdfPagesAsImages(
  pdfBytes: Uint8Array,
  scale = 1.8,
  password?: string
): Promise<Array<{ page: number; dataUrl: string; width: number; height: number }>> {
  const pdf = await openPdfProxy(pdfBytes, password);
  const images: Array<{ page: number; dataUrl: string; width: number; height: number }> = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
      images.push({
        page: p,
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
      });
    }
    return images;
  } finally {
    await pdf.loadingTask.destroy();
  }
}

export async function inspectPdfMetadata(
  pdfBytes: Uint8Array,
  fileName: string
): Promise<PdfMetadataInfo> {
  const doc = await PDFDocument.load(pdfBytes.slice(), { ignoreEncryption: false });
  const pages = doc.getPages();
  const pageDimensions = pages.map((page, index) => {
    const { width, height } = page.getSize();
    return {
      page: index + 1,
      widthPt: Math.round(width),
      heightPt: Math.round(height),
    };
  });
  const created = doc.getCreationDate();
  return {
    fileName,
    pageCount: doc.getPageCount(),
    sizeBytes: pdfBytes.byteLength,
    title: doc.getTitle() || undefined,
    author: doc.getAuthor() || undefined,
    creator: doc.getCreator() || undefined,
    creationDate: created ? created.toLocaleString() : undefined,
    pageDimensions,
  };
}

export async function mergePdfs(
  items: Array<{ name: string; bytes: Uint8Array }>,
  onProgress?: (current: number, total: number) => void
): Promise<{ pdfBytes: Uint8Array; pageCount: number; thumbnailDataUrl: string }> {
  if (items.length < 2) {
    throw new Error('Select at least 2 PDF files to merge.');
  }
  const merged = await PDFDocument.create();
  merged.setCreator('Pinkora PDF');

  for (let i = 0; i < items.length; i++) {
    const src = await PDFDocument.load(items[i].bytes.slice());
    const copied = await merged.copyPages(src, src.getPageIndices());
    copied.forEach((p) => merged.addPage(p));
    onProgress?.(i + 1, items.length);
  }

  const pdfBytes = await merged.save();
  const thumbnailDataUrl = await generatePdfThumbnail(pdfBytes).catch(() => '');
  return { pdfBytes, pageCount: merged.getPageCount(), thumbnailDataUrl };
}

export async function splitPdfByRange(
  pdfBytes: Uint8Array,
  startPage: number,
  endPage: number
): Promise<{ pdfBytes: Uint8Array; pageCount: number; thumbnailDataUrl: string }> {
  const src = await PDFDocument.load(pdfBytes.slice());
  const total = src.getPageCount();
  const s = Math.max(1, Math.min(total, startPage));
  const e = Math.max(s, Math.min(total, endPage));
  const indices: number[] = [];
  for (let p = s; p <= e; p++) {
    indices.push(p - 1);
  }
  const out = await PDFDocument.create();
  out.setCreator('Pinkora PDF');
  const copied = await out.copyPages(src, indices);
  copied.forEach((page) => out.addPage(page));
  const outBytes = await out.save();
  const thumbnailDataUrl = await generatePdfThumbnail(outBytes).catch(() => '');
  return { pdfBytes: outBytes, pageCount: out.getPageCount(), thumbnailDataUrl };
}

export async function extractPdfPages(
  pdfBytes: Uint8Array,
  oneBasedPages: number[]
): Promise<{ pdfBytes: Uint8Array; pageCount: number; thumbnailDataUrl: string }> {
  if (oneBasedPages.length === 0) {
    throw new Error('Select at least one page to extract.');
  }
  const src = await PDFDocument.load(pdfBytes.slice());
  const total = src.getPageCount();
  const indices = oneBasedPages
    .filter((p) => p >= 1 && p <= total)
    .map((p) => p - 1);
  if (indices.length === 0) {
    throw new Error('No valid page numbers selected.');
  }
  const out = await PDFDocument.create();
  out.setCreator('Pinkora PDF');
  const copied = await out.copyPages(src, indices);
  copied.forEach((p) => out.addPage(p));
  const outBytes = await out.save();
  const thumbnailDataUrl = await generatePdfThumbnail(outBytes).catch(() => '');
  return { pdfBytes: outBytes, pageCount: out.getPageCount(), thumbnailDataUrl };
}

export async function rotatePdfPages(
  pdfBytes: Uint8Array,
  rotationsByPage: Record<number, number>
): Promise<{ pdfBytes: Uint8Array; pageCount: number; thumbnailDataUrl: string }> {
  const doc = await PDFDocument.load(pdfBytes.slice());
  const pages = doc.getPages();
  pages.forEach((page, idx) => {
    const delta = rotationsByPage[idx + 1] ?? 0;
    if (delta !== 0) {
      const current = page.getRotation().angle;
      page.setRotation(degrees((current + delta) % 360));
    }
  });
  const outBytes = await doc.save();
  const thumbnailDataUrl = await generatePdfThumbnail(outBytes).catch(() => '');
  return { pdfBytes: outBytes, pageCount: doc.getPageCount(), thumbnailDataUrl };
}

export async function compressPdf(
  pdfBytes: Uint8Array,
  preset: QualityPreset,
  onProgress?: (current: number, total: number) => void
): Promise<{ pdfBytes: Uint8Array; pageCount: number; thumbnailDataUrl: string }> {
  const srcProxy = await openPdfProxy(pdfBytes);
  const outDoc = await PDFDocument.create();
  outDoc.setCreator('Pinkora PDF');

  const scale = preset === 'high' ? 1.6 : preset === 'balanced' ? 1.25 : 0.95;
  const jpegQuality = preset === 'high' ? 0.85 : preset === 'balanced' ? 0.65 : 0.45;

  try {
    for (let p = 1; p <= srcProxy.numPages; p++) {
      const page = await srcProxy.getPage(p);
      const vp1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Compression render failed.'))),
          'image/jpeg',
          jpegQuality
        );
      });
      const jpgBytes = new Uint8Array(await blob.arrayBuffer());
      const embedded = await outDoc.embedJpg(jpgBytes);
      const outPage = outDoc.addPage([vp1.width, vp1.height]);
      outPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: vp1.width,
        height: vp1.height,
      });
      onProgress?.(p, srcProxy.numPages);
    }

    const outBytes = await outDoc.save();
    const thumbnailDataUrl = await generatePdfThumbnail(outBytes).catch(() => '');
    return {
      pdfBytes: outBytes,
      pageCount: outDoc.getPageCount(),
      thumbnailDataUrl,
    };
  } finally {
    await srcProxy.loadingTask.destroy();
  }
}

export async function savePdfToDevice(
  pdfBytes: Uint8Array,
  filename: string
): Promise<void> {
  const cleanName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  const copy = new Uint8Array(pdfBytes);
  const blob = new Blob([copy], { type: 'application/pdf' });

  const win = window as unknown as {
    showSaveFilePicker?: (opts: {
      suggestedName: string;
      types: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };

  if (typeof win.showSaveFilePicker === 'function') {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName: cleanName,
        types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cleanName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function sharePdfDocument(
  pdfBytes: Uint8Array,
  filename: string
): Promise<'shared' | 'downloaded'> {
  const cleanName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  const copy = new Uint8Array(pdfBytes);
  const file = new File([copy], cleanName, { type: 'application/pdf' });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    await navigator.share({
      title: cleanName,
      files: [file],
    });
    return 'shared';
  }

  await savePdfToDevice(pdfBytes, cleanName);
  return 'downloaded';
}

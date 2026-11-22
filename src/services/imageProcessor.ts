import { FilterPreset, NormalizedPoint, PageItem, QuadPoints, ResizePreset } from '../types/pinkora';

export const FULL_QUAD: QuadPoints = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export const FILTER_OPTIONS: Array<{ id: FilterPreset; label: string }> = [
  { id: 'original', label: 'Original' },
  { id: 'auto_enhance', label: 'Auto Color' },
  { id: 'magic_scan', label: 'Magic Scan' },
  { id: 'bw_doc', label: 'B&W Crisp' },
  { id: 'grayscale', label: 'Grayscale' },
  { id: 'warm_paper', label: 'Warm Paper' },
  { id: 'invert_dark', label: 'Dark Invert' },
];

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode selected image.'));
    img.src = src;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

export function isFullQuad(quad: QuadPoints): boolean {
  const eps = 0.008;
  return (
    Math.abs(quad[0].x) < eps &&
    Math.abs(quad[0].y) < eps &&
    Math.abs(quad[1].x - 1) < eps &&
    Math.abs(quad[1].y) < eps &&
    Math.abs(quad[2].x - 1) < eps &&
    Math.abs(quad[2].y - 1) < eps &&
    Math.abs(quad[3].x) < eps &&
    Math.abs(quad[3].y - 1) < eps
  );
}

/**
 * Lightweight edge-guided document quad detector using luminance gradients
 * around the outer border / bright page region, falling back cleanly to
 * a slight inset or full quad when edges are ambiguous.
 */
export async function detectDocumentQuad(dataUrl: string): Promise<QuadPoints> {
  try {
    const img = await loadImageElement(dataUrl);
    const maxDim = 240;
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(40, Math.round(img.naturalWidth * scale));
    const h = Math.max(40, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    // Grayscale buffer
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }

    // Sobel edge magnitude
    const edge = new Float32Array(w * h);
    let maxMag = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const gx =
          -gray[(y - 1) * w + (x - 1)] +
          gray[(y - 1) * w + (x + 1)] -
          2 * gray[y * w + (x - 1)] +
          2 * gray[y * w + (x + 1)] -
          gray[(y + 1) * w + (x - 1)] +
          gray[(y + 1) * w + (x + 1)];
        const gy =
          -gray[(y - 1) * w + (x - 1)] -
          2 * gray[(y - 1) * w + x] -
          gray[(y - 1) * w + (x + 1)] +
          gray[(y + 1) * w + (x - 1)] +
          2 * gray[(y + 1) * w + x] +
          gray[(y + 1) * w + (x + 1)];
        const mag = Math.hypot(gx, gy);
        edge[y * w + x] = mag;
        if (mag > maxMag) maxMag = mag;
      }
    }

    if (maxMag < 45) {
      return [...FULL_QUAD] as QuadPoints;
    }

    const threshold = maxMag * 0.28;
    const findCorner = (
      xStart: number,
      xEnd: number,
      yStart: number,
      yEnd: number,
      targetX: number,
      targetY: number
    ): NormalizedPoint | null => {
      let bestScore = -Infinity;
      let bestPt: NormalizedPoint | null = null;
      const xStep = xStart <= xEnd ? 1 : -1;
      const yStep = yStart <= yEnd ? 1 : -1;
      for (let y = yStart; yStep > 0 ? y < yEnd : y > yEnd; y += yStep) {
        for (let x = xStart; xStep > 0 ? x < xEnd : x > xEnd; x += xStep) {
          const e = edge[y * w + x];
          if (e < threshold) continue;
          const dist = Math.hypot(x - targetX, y - targetY);
          const score = e * 0.45 - dist * 1.3;
          if (score > bestScore) {
            bestScore = score;
            bestPt = { x: x / w, y: y / h };
          }
        }
      }
      return bestPt;
    };

    const halfW = Math.floor(w * 0.45);
    const halfH = Math.floor(h * 0.45);

    const tl = findCorner(2, halfW, 2, halfH, w * 0.08, h * 0.08);
    const tr = findCorner(w - 3, w - halfW, 2, halfH, w * 0.92, h * 0.08);
    const br = findCorner(w - 3, w - halfW, h - 3, h - halfH, w * 0.92, h * 0.92);
    const bl = findCorner(2, halfW, h - 3, h - halfH, w * 0.08, h * 0.92);

    if (!tl || !tr || !br || !bl) {
      return [...FULL_QUAD] as QuadPoints;
    }

    // Sanity check area >= 30% of image
    const area =
      0.5 *
      Math.abs(
        tl.x * tr.y -
          tr.x * tl.y +
          (tr.x * br.y - br.x * tr.y) +
          (br.x * bl.y - bl.x * br.y) +
          (bl.x * tl.y - tl.x * bl.y)
      );
    if (area < 0.3 || area > 0.98) {
      return [...FULL_QUAD] as QuadPoints;
    }

    return [tl, tr, br, bl];
  } catch {
    return [...FULL_QUAD] as QuadPoints;
  }
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) {
        pivot = r;
      }
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const div = M[col][col] || 1e-9;
    for (let j = col; j <= n; j++) M[col][j] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let j = col; j <= n; j++) {
        M[r][j] -= factor * M[col][j];
      }
    }
  }
  return M.map((row) => row[n]);
}

function computeHomography(
  src: Array<{ x: number; y: number }>,
  dst: Array<{ x: number; y: number }>
): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const sx = src[i].x;
    const sy = src[i].y;
    const dx = dst[i].x;
    const dy = dst[i].y;
    A.push([dx, dy, 1, 0, 0, 0, -dx * sx, -dy * sx]);
    b.push(sx);
    A.push([0, 0, 0, dx, dy, 1, -dx * sy, -dy * sy]);
    b.push(sy);
  }
  const h = solveLinearSystem(A, b);
  return [...h, 1];
}

function warpPerspectiveCanvas(
  img: HTMLImageElement,
  quad: QuadPoints
): HTMLCanvasElement {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  const pts = quad.map((p) => ({ x: p.x * iw, y: p.y * ih }));
  const widthTop = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const widthBottom = Math.hypot(pts[2].x - pts[3].x, pts[2].y - pts[3].y);
  const heightLeft = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
  const heightRight = Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y);

  let outW = Math.max(80, Math.round((widthTop + widthBottom) / 2));
  let outH = Math.max(80, Math.round((heightLeft + heightRight) / 2));

  // Cap max warp dimension for smooth client performance
  const maxWarp = 1800;
  if (Math.max(outW, outH) > maxWarp) {
    const ratio = maxWarp / Math.max(outW, outH);
    outW = Math.round(outW * ratio);
    outH = Math.round(outH * ratio);
  }

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = iw;
  srcCanvas.height = ih;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.drawImage(img, 0, 0, iw, ih);
  const srcData = srcCtx.getImageData(0, 0, iw, ih).data;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d')!;
  const outImg = outCtx.createImageData(outW, outH);
  const dstData = outImg.data;

  const H = computeHomography(pts, [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ]);

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const denom = H[6] * x + H[7] * y + 1;
      const sx = (H[0] * x + H[1] * y + H[2]) / denom;
      const sy = (H[3] * x + H[4] * y + H[5]) / denom;

      const ix = Math.round(sx);
      const iy = Math.round(sy);
      const di = (y * outW + x) * 4;

      if (ix >= 0 && ix < iw && iy >= 0 && iy < ih) {
        const si = (iy * iw + ix) * 4;
        dstData[di] = srcData[si];
        dstData[di + 1] = srcData[si + 1];
        dstData[di + 2] = srcData[si + 2];
        dstData[di + 3] = srcData[si + 3];
      } else {
        dstData[di] = 255;
        dstData[di + 1] = 255;
        dstData[di + 2] = 255;
        dstData[di + 3] = 255;
      }
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  return outCanvas;
}

function applyFilterToCanvas(canvas: HTMLCanvasElement, filter: FilterPreset): void {
  if (filter === 'original') return;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (filter === 'grayscale') {
      const c = Math.min(255, Math.max(0, (lum - 128) * 1.15 + 128));
      d[i] = d[i + 1] = d[i + 2] = c;
    } else if (filter === 'bw_doc') {
      const boosted = lum > 142 ? 255 : lum < 92 ? 12 : Math.round((lum - 92) * 4.8);
      d[i] = d[i + 1] = d[i + 2] = Math.min(255, Math.max(0, boosted));
    } else if (filter === 'auto_enhance') {
      const stretch = (val: number) => Math.min(255, Math.max(0, (val - 12) * 1.12));
      d[i] = stretch(r);
      d[i + 1] = stretch(g);
      d[i + 2] = stretch(b);
    } else if (filter === 'magic_scan') {
      // Whitens paper background while keeping ink & colored stamps crisp
      if (lum > 165) {
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
      } else {
        const lift = lum > 110 ? 1.18 : 0.86;
        d[i] = Math.min(255, Math.max(0, Math.round((r - 18) * lift + 18)));
        d[i + 1] = Math.min(255, Math.max(0, Math.round((g - 18) * lift + 18)));
        d[i + 2] = Math.min(255, Math.max(0, Math.round((b - 18) * lift + 18)));
      }
    } else if (filter === 'warm_paper') {
      d[i] = Math.min(255, Math.round(r * 1.04 + 8));
      d[i + 1] = Math.min(255, Math.round(g * 1.0 + 4));
      d[i + 2] = Math.min(255, Math.max(0, Math.round(b * 0.88 - 4)));
    } else if (filter === 'invert_dark') {
      d[i] = 255 - r;
      d[i + 1] = 255 - g;
      d[i + 2] = 255 - b;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

function resizeMaxSide(preset: ResizePreset): number | null {
  switch (preset) {
    case 'original':
      return 2200;
    case 'hd':
      return 1600;
    case 'medium':
      return 1200;
    case 'compact':
      return 850;
  }
}

export async function renderProcessedPage(
  originalDataUrl: string,
  cropQuad: QuadPoints,
  rotation: 0 | 90 | 180 | 270,
  filter: FilterPreset,
  resizePreset: ResizePreset
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImageElement(originalDataUrl);
  let workingCanvas: HTMLCanvasElement;

  if (isFullQuad(cropQuad)) {
    workingCanvas = document.createElement('canvas');
    workingCanvas.width = img.naturalWidth || img.width;
    workingCanvas.height = img.naturalHeight || img.height;
    const ctx = workingCanvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
  } else {
    workingCanvas = warpPerspectiveCanvas(img, cropQuad);
  }

  // Rotation
  if (rotation !== 0) {
    const rotCanvas = document.createElement('canvas');
    const swap = rotation === 90 || rotation === 270;
    rotCanvas.width = swap ? workingCanvas.height : workingCanvas.width;
    rotCanvas.height = swap ? workingCanvas.width : workingCanvas.height;
    const rCtx = rotCanvas.getContext('2d')!;
    rCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    rCtx.rotate((rotation * Math.PI) / 180);
    rCtx.drawImage(
      workingCanvas,
      -workingCanvas.width / 2,
      -workingCanvas.height / 2
    );
    workingCanvas = rotCanvas;
  }

  // Resize
  const maxSide = resizeMaxSide(resizePreset);
  if (maxSide && Math.max(workingCanvas.width, workingCanvas.height) > maxSide) {
    const ratio = maxSide / Math.max(workingCanvas.width, workingCanvas.height);
    const resized = document.createElement('canvas');
    resized.width = Math.max(1, Math.round(workingCanvas.width * ratio));
    resized.height = Math.max(1, Math.round(workingCanvas.height * ratio));
    const rsCtx = resized.getContext('2d')!;
    rsCtx.imageSmoothingEnabled = true;
    rsCtx.imageSmoothingQuality = 'high';
    rsCtx.drawImage(workingCanvas, 0, 0, resized.width, resized.height);
    workingCanvas = resized;
  }

  applyFilterToCanvas(workingCanvas, filter);

  return {
    dataUrl: workingCanvas.toDataURL('image/jpeg', 0.9),
    width: workingCanvas.width,
    height: workingCanvas.height,
  };
}

export async function createPageItemFromFile(file: File): Promise<PageItem> {
  const originalDataUrl = await fileToDataUrl(file);
  const img = await loadImageElement(originalDataUrl);
  const quad = [...FULL_QUAD] as QuadPoints;
  const rendered = await renderProcessedPage(
    originalDataUrl,
    quad,
    0,
    'original',
    'hd'
  );

  return {
    id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    originalDataUrl,
    originalWidth: img.naturalWidth || img.width,
    originalHeight: img.naturalHeight || img.height,
    cropQuad: quad,
    rotation: 0,
    filter: 'original',
    resizePreset: 'hd',
    processedDataUrl: rendered.dataUrl,
    processedWidth: rendered.width,
    processedHeight: rendered.height,
  };
}

export async function createPageItemFromDataUrl(
  dataUrl: string,
  name: string,
  autoCrop = true,
  filter: FilterPreset = 'auto_enhance'
): Promise<PageItem> {
  const img = await loadImageElement(dataUrl);
  const quad = autoCrop ? await detectDocumentQuad(dataUrl) : ([...FULL_QUAD] as QuadPoints);
  const rendered = await renderProcessedPage(dataUrl, quad, 0, filter, 'hd');

  return {
    id: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    originalDataUrl: dataUrl,
    originalWidth: img.naturalWidth || img.width,
    originalHeight: img.naturalHeight || img.height,
    cropQuad: quad,
    rotation: 0,
    filter,
    resizePreset: 'hd',
    processedDataUrl: rendered.dataUrl,
    processedWidth: rendered.width,
    processedHeight: rendered.height,
  };
}

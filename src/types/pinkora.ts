export type NavTab = 'home' | 'files' | 'tools' | 'settings';

export type FilterPreset =
  | 'original'
  | 'auto_enhance'
  | 'magic_scan'
  | 'bw_doc'
  | 'grayscale'
  | 'warm_paper'
  | 'invert_dark';
export type ResizePreset = 'original' | 'hd' | 'medium' | 'compact';
export type PageSizeOption = 'a4' | 'letter' | 'original';
export type PageOrientation = 'auto' | 'portrait' | 'landscape';
export type ImageFitMode = 'margins' | 'fit' | 'fill';
export type QualityPreset = 'high' | 'balanced' | 'compact';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface NormalizedPoint {
  x: number; // 0..1
  y: number; // 0..1
}

export type QuadPoints = [
  NormalizedPoint, // top-left
  NormalizedPoint, // top-right
  NormalizedPoint, // bottom-right
  NormalizedPoint, // bottom-left
];

export interface PageItem {
  id: string;
  name: string;
  originalDataUrl: string;
  originalWidth: number;
  originalHeight: number;
  cropQuad: QuadPoints;
  rotation: 0 | 90 | 180 | 270;
  filter: FilterPreset;
  resizePreset: ResizePreset;
  processedDataUrl: string;
  processedWidth: number;
  processedHeight: number;
}

export interface PdfGenerationOptions {
  filename: string;
  pageSize: PageSizeOption;
  orientation: PageOrientation;
  fitMode: ImageFitMode;
  quality: QualityPreset;
  password?: string;
  addPageNumbers?: boolean;
  watermarkText?: string;
}

export interface PdfDocumentRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pageCount: number;
  sizeBytes: number;
  thumbnailDataUrl: string;
  pdfBytes: Uint8Array;
  isProtected?: boolean;
}

export interface AppSettings {
  theme: ThemePreference;
  defaultPageSize: PageSizeOption;
  defaultOrientation: PageOrientation;
  defaultFitMode: ImageFitMode;
  defaultQuality: QualityPreset;
  filenamePrefix: string;
}

export type ActiveToolId =
  | 'images_to_pdf'
  | 'pdf_to_images'
  | 'protect_pdf'
  | 'merge_pdfs'
  | 'split_pdf'
  | 'extract_pages'
  | 'rotate_pages'
  | 'compress_pdf'
  | 'pdf_info';

export interface PdfMetadataInfo {
  fileName: string;
  pageCount: number;
  sizeBytes: number;
  title?: string;
  author?: string;
  creator?: string;
  creationDate?: string;
  pageDimensions: Array<{ page: number; widthPt: number; heightPt: number }>;
}

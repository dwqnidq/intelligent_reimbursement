import * as path from 'node:path';

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;

export interface AttachmentFileInfo {
  url: string;
  original_name?: string;
  mime_type?: string;
}

export interface EmbeddableImage {
  buffer: Buffer;
  extension: 'png' | 'jpeg' | 'gif';
  sourceUrl: string;
  tooltip?: string;
}

export interface AttachmentProcessResult {
  images: EmbeddableImage[];
  hyperlinks: { url: string; label: string }[];
}

function resolveImageExtension(
  mimeType: string | undefined,
  url: string,
  originalName?: string,
): 'png' | 'jpeg' | 'gif' | null {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpeg';
  if (mime === 'image/webp') return 'png';

  const ext = path
    .extname(originalName || url)
    .replace(/^\./, '')
    .toLowerCase();
  if (ext === 'png') return 'png';
  if (ext === 'gif') return 'gif';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'webp') return 'png';
  return null;
}

function isPdf(mimeType: string | undefined, url: string, originalName?: string) {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'application/pdf') return true;
  const ext = path
    .extname(originalName || url)
    .replace(/^\./, '')
    .toLowerCase();
  return ext === 'pdf' || url.toLowerCase().includes('/pdf/');
}

async function downloadFile(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return null;
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_DOWNLOAD_BYTES) return null;
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_DOWNLOAD_BYTES) return null;
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

async function convertPdfToPngBuffers(buffer: Buffer): Promise<Buffer[]> {
  try {
    const { pdf } = await import('pdf-to-img');
    const doc = await pdf(buffer, { scale: 1.5 });
    const pages: Buffer[] = [];
    for await (const page of doc) {
      pages.push(Buffer.from(page));
      if (pages.length >= 3) break;
    }
    await doc.destroy();
    return pages;
  } catch {
    return [];
  }
}

export async function processAttachmentFile(
  file: AttachmentFileInfo,
): Promise<AttachmentProcessResult> {
  const label = file.original_name || '附件';
  const url = file.url;
  if (!url) {
    return { images: [], hyperlinks: [] };
  }

  const imageExt = resolveImageExtension(file.mime_type, url, file.original_name);
  if (imageExt) {
    const buffer = await downloadFile(url);
    if (buffer) {
      return {
        images: [{ buffer, extension: imageExt, sourceUrl: url, tooltip: label }],
        hyperlinks: [],
      };
    }
    return { images: [], hyperlinks: [{ url, label }] };
  }

  if (isPdf(file.mime_type, url, file.original_name)) {
    const buffer = await downloadFile(url);
    if (buffer) {
      const pages = await convertPdfToPngBuffers(buffer);
      if (pages.length > 0) {
        return {
          images: pages.map((pageBuffer) => ({
            buffer: pageBuffer,
            extension: 'png' as const,
            sourceUrl: url,
            tooltip: label,
          })),
          hyperlinks: [],
        };
      }
    }
    return { images: [], hyperlinks: [{ url, label }] };
  }

  return { images: [], hyperlinks: [{ url, label }] };
}

export const ATTACHMENT_COL_WIDTH = 24;
/** 每个图片槽位的行高（磅），与单元格锚定配合使用 */
export const ATTACHMENT_ROW_HEIGHT_PER_IMAGE = 90;

export function calcAttachmentRowHeight(imageCount: number, hasHyperlinks: boolean) {
  if (imageCount <= 0) return hasHyperlinks ? 28 : 20;
  const imageArea = imageCount * ATTACHMENT_ROW_HEIGHT_PER_IMAGE;
  const linkArea = hasHyperlinks ? 18 : 0;
  return Math.max(24, imageArea + linkArea);
}

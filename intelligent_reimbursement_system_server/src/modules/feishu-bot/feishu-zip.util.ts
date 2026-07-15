import AdmZip from 'adm-zip';
import { classifyFileName, isRecognizableKind } from './feishu-file.classifier';
import {
  duplicateFileNameKey,
  duplicateFileSkipMessage,
} from './feishu-file-dedup.util';

export type ZipExtractOptions = {
  maxFiles: number;
  maxTotalBytes: number;
  maxFileBytes: number;
};

export type ZipExtractEntry = {
  file_name: string;
  buffer: Buffer;
};

export type ZipExtractResult =
  | { ok: true; entries: ZipExtractEntry[]; skipped: string[] }
  | { ok: false; reason: string; skipped: string[] };

export function extractRecognizableFromZip(
  zipBuffer: Buffer,
  options: ZipExtractOptions,
): ZipExtractResult {
  const skipped: string[] = [];
  const entries: ZipExtractEntry[] = [];
  const seenBaseNames = new Set<string>();
  let totalBytes = 0;
  const hasFileLimit = options.maxFiles > 0;
  const hasTotalLimit = options.maxTotalBytes > 0;

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    return { ok: false, reason: '压缩包无法解压', skipped: [] };
  }

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;

    const fileName = entry.entryName.replace(/\\/g, '/');
    const baseName = fileName.split('/').pop() ?? fileName;

    if (isZipMetadataEntry(fileName)) {
      skipped.push(fileName);
      continue;
    }

    const kind = classifyFileName(baseName);

    if (kind === 'zip') {
      skipped.push(fileName);
      continue;
    }

    if (!isRecognizableKind(kind)) {
      skipped.push(fileName);
      continue;
    }

    const data = entry.getData();
    if (data.length > options.maxFileBytes) {
      skipped.push(fileName);
      continue;
    }

    const dedupeKey = duplicateFileNameKey(fileName);
    if (seenBaseNames.has(dedupeKey)) {
      skipped.push(duplicateFileSkipMessage(fileName));
      continue;
    }
    seenBaseNames.add(dedupeKey);

    totalBytes += data.length;
    if (hasTotalLimit && totalBytes > options.maxTotalBytes) {
      return {
        ok: false,
        reason: `解压后总大小超过 ${formatBytes(options.maxTotalBytes)} 限制`,
        skipped: [...skipped, fileName],
      };
    }

    entries.push({ file_name: fileName, buffer: data });

    if (hasFileLimit && entries.length > options.maxFiles) {
      return {
        ok: false,
        reason: `可识别文件数量超过 ${options.maxFiles} 个限制`,
        skipped,
      };
    }
  }

  return { ok: true, entries, skipped };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

/** Mac 压缩 zip 时常见的元数据，本地解压器通常不展示 */
export function isZipMetadataEntry(fileName: string): boolean {
  const normalized = fileName.replace(/\\/g, '/');
  if (normalized.startsWith('__MACOSX/')) return true;
  const baseName = normalized.split('/').pop() ?? normalized;
  if (baseName.startsWith('._')) return true;
  if (baseName === '.DS_Store' || baseName === 'Thumbs.db') return true;
  return false;
}

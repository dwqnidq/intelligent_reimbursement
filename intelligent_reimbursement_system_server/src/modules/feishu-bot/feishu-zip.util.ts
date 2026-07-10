import AdmZip from 'adm-zip';
import { classifyFileName, isRecognizableKind } from './feishu-file.classifier';

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
  let totalBytes = 0;

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

    totalBytes += data.length;
    if (totalBytes > options.maxTotalBytes) {
      return {
        ok: false,
        reason: `解压后总大小超过 ${options.maxTotalBytes} 字节限制`,
        skipped: [...skipped, fileName],
      };
    }

    entries.push({ file_name: fileName, buffer: data });

    if (entries.length > options.maxFiles) {
      return {
        ok: false,
        reason: `可识别文件数量超过 ${options.maxFiles} 个限制`,
        skipped,
      };
    }
  }

  return { ok: true, entries, skipped };
}

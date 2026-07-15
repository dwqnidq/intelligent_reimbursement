export type FeishuFileKind = 'image' | 'pdf' | 'zip' | 'folder' | 'other';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.jepg', '.png', '.webp']);

export function classifyFileName(fileName: string): FeishuFileKind {
  const lower = fileName.trim().toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot >= 0 ? lower.slice(dot) : '';
  if (IMAGE_EXT.has(ext)) return 'image';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.zip') return 'zip';
  return 'other';
}

export function isRecognizableKind(kind: FeishuFileKind): boolean {
  return kind === 'image' || kind === 'pdf';
}

export const FOLDER_SKIP_REASON =
  '飞书文件夹无法通过机器人处理，请压缩为 zip 后发送';

export function folderSkipMessage(fileName: string): string {
  return `${fileName}: ${FOLDER_SKIP_REASON}`;
}

/** 可在确认卡展示、但不可下载解压的容器（如飞书文件夹） */
export function isContainerKind(kind: FeishuFileKind): boolean {
  return kind === 'zip' || kind === 'folder';
}

/** 可通过 API 下载并解压的容器（仅 zip） */
export function isExtractableContainer(kind: FeishuFileKind): boolean {
  return kind === 'zip';
}

export type FeishuFileKind = 'image' | 'pdf' | 'zip' | 'other';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

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

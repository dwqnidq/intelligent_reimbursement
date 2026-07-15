import {
  classifyFileName,
  isContainerKind,
  isRecognizableKind,
  type FeishuFileKind,
} from './feishu-file.classifier';

export type ParsedSourceFile = {
  file_key: string;
  file_name: string;
  kind: FeishuFileKind;
  message_id: string;
  /** 飞书下载资源 API 的 type 参数，由消息类型决定，与文件扩展名无关 */
  resource_type: 'file' | 'image';
};

export function extractFileName(content: Record<string, unknown>): string {
  for (const key of ['file_name', 'fileName', 'name', 'image_name'] as const) {
    const value = String(content[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function pushRecognizableFile(
  sourceFiles: ParsedSourceFile[],
  skipped: string[],
  entry: {
    file_key: string;
    file_name: string;
    message_id: string;
    resource_type: 'file' | 'image';
  },
) {
  const kind = classifyFileName(entry.file_name);
  if (isRecognizableKind(kind) || isContainerKind(kind)) {
    sourceFiles.push({ ...entry, kind });
  } else {
    skipped.push(entry.file_name);
  }
}

export function parseFeishuMessageFiles(message: {
  message_id: string;
  message_type?: string;
  content?: string;
}): { sourceFiles: ParsedSourceFile[]; skipped: string[] } {
  const sourceFiles: ParsedSourceFile[] = [];
  const skipped: string[] = [];
  let content: Record<string, unknown> = {};
  try {
    content = message.content
      ? (JSON.parse(message.content) as Record<string, unknown>)
      : {};
  } catch {
    return { sourceFiles, skipped };
  }

  const type = message.message_type;

  if ((type === 'file' || type === 'media') && content.file_key) {
    pushRecognizableFile(sourceFiles, skipped, {
      file_key: String(content.file_key),
      file_name: extractFileName(content) || 'file.bin',
      message_id: message.message_id,
      resource_type: 'file',
    });
    return { sourceFiles, skipped };
  }

  if (type === 'folder' && content.file_key) {
    sourceFiles.push({
      file_key: String(content.file_key),
      file_name: extractFileName(content) || '文件夹',
      kind: 'folder',
      message_id: message.message_id,
      resource_type: 'file',
    });
    return { sourceFiles, skipped };
  }

  if (type === 'image' && content.image_key) {
    const hintedName = extractFileName(content);
    sourceFiles.push({
      file_key: String(content.image_key),
      file_name: hintedName || '未命名图片.jpg',
      kind: 'image',
      message_id: message.message_id,
      resource_type: 'image',
    });
    return { sourceFiles, skipped };
  }

  return { sourceFiles, skipped };
}

/** 轻量判断：消息是否可能携带文件（不请求飞书 API） */
export function isLikelyFileMessage(message: {
  message_type?: string;
  content?: string;
}): boolean {
  const type = message.message_type;
  if (
    type === 'file' ||
    type === 'media' ||
    type === 'folder' ||
    type === 'image'
  ) {
    return true;
  }
  if (!message.content) return false;
  try {
    const content = JSON.parse(message.content) as Record<string, unknown>;
    return Boolean(content.file_key || content.image_key);
  } catch {
    return false;
  }
}

export function isSyntheticFileName(fileName: string): boolean {
  return (
    /^image_img_/i.test(fileName) ||
    fileName === '未命名图片.jpg' ||
    fileName === 'file.bin'
  );
}

export function mergeMessageContent(
  eventContent: Record<string, unknown>,
  fetchedContent: Record<string, unknown>,
): Record<string, unknown> {
  return { ...eventContent, ...fetchedContent };
}

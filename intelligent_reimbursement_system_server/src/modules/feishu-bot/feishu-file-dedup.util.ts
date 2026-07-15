export function getRecognizableBaseName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, '/');
  return normalized.split('/').pop() ?? normalized;
}

export function duplicateFileNameKey(fileName: string): string {
  return getRecognizableBaseName(fileName).toLowerCase();
}

export function duplicateFileSkipMessage(fileName: string): string {
  const baseName = getRecognizableBaseName(fileName);
  return `${fileName}: 重复文件名（${baseName}），已跳过`;
}

export function deduplicateByFileName<T extends { file_name: string }>(
  items: T[],
  skipped: string[],
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = duplicateFileNameKey(item.file_name);
    if (seen.has(key)) {
      skipped.push(duplicateFileSkipMessage(item.file_name));
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

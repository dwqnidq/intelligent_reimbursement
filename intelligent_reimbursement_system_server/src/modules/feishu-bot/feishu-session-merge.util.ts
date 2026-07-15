import type { ParsedSourceFile } from './feishu-message-files';

export function sourceFileIdentity(file: {
  message_id?: string;
  file_key: string;
}): string {
  return `${file.message_id ?? ''}:${file.file_key}`;
}

export function mergeSourceFiles<
  TExisting extends {
    message_id?: string;
    file_key: string;
    file_name: string;
    kind: ParsedSourceFile['kind'];
    resource_type?: ParsedSourceFile['resource_type'];
  },
>(
  existing: TExisting[],
  incoming: ParsedSourceFile[],
): TExisting[] {
  const seen = new Set(existing.map((file) => sourceFileIdentity(file)));
  const merged = [...existing];

  for (const file of incoming) {
    const key = sourceFileIdentity(file);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ ...file } as TExisting);
  }

  return merged;
}

export function mergeUniqueStrings(
  existing: string[],
  incoming: string[],
): string[] {
  const seen = new Set(existing);
  const merged = [...existing];

  for (const item of incoming) {
    if (seen.has(item)) continue;
    seen.add(item);
    merged.push(item);
  }

  return merged;
}

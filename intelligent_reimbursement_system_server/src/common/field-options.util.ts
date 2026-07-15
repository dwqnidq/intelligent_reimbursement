export interface NormalizedFieldOption {
  label: string;
  value: string;
}

/**
 * 将下拉选项归一为 { label, value }。
 * 兼容历史 string[] 与 AI 生成的字符串选项。
 */
export function normalizeFieldOption(
  raw: unknown,
): NormalizedFieldOption | null {
  if (raw == null) return null;

  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    return { label: s, value: s };
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) return null;

  const obj = raw as { label?: unknown; value?: unknown };
  const label = String(obj.label ?? '').trim();
  const value = String(obj.value ?? label).trim();
  if (!label && !value) return null;
  return {
    label: label || value,
    value: value || label,
  };
}

export function normalizeFieldOptions(raw: unknown): NormalizedFieldOption[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedFieldOption[] = [];
  for (const item of raw) {
    const opt = normalizeFieldOption(item);
    if (opt) out.push(opt);
  }
  return out;
}

/** 归一化报销类型 fields 中的 options */
export function normalizeTypeFieldsOptions<T extends { options?: unknown }>(
  fields: T[] | undefined | null,
): T[] {
  if (!Array.isArray(fields)) return [];
  return fields.map((f) => ({
    ...f,
    options: normalizeFieldOptions(f?.options),
  }));
}

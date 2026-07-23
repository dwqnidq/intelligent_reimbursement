/** 未匹配发票提交前：校验每张均已选手动报销类型 */

export type TypeSelectionItem = {
  matched: boolean;
  duplicate?: boolean;
};

export function listMissingUnmatchedTypeIndexes(
  items: TypeSelectionItem[],
  formValue: Record<string, string | undefined>,
): number[] {
  const missing: number[] = [];
  items.forEach((item, index) => {
    if (item.matched || item.duplicate) return;
    const selected = String(formValue[`type_${index}`] ?? '').trim();
    if (!selected) missing.push(index);
  });
  return missing;
}

export function unmatchedTypeSelectionHint(missingCount: number): string {
  if (missingCount <= 0) return '';
  if (missingCount === 1) {
    return '请为未匹配发票选择报销类型后再提交';
  }
  return `还有 ${missingCount} 张未匹配发票未选择报销类型，请选择后再提交`;
}

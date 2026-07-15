import type { ResultCardItem } from './feishu-card.builder';

export type IndexedResultCardItem = {
  index: number;
  item: ResultCardItem;
};

export type ResultCardDisplayGroup = {
  indices: number[];
  representativeIndex: number;
  representative: ResultCardItem;
  items: ResultCardItem[];
};

export type PartitionedResultCardItems = {
  duplicate: IndexedResultCardItem[];
  matched: IndexedResultCardItem[];
  unmatched: IndexedResultCardItem[];
};

export function partitionResultCardItems(
  items: ResultCardItem[],
): PartitionedResultCardItems {
  const duplicate: IndexedResultCardItem[] = [];
  const matched: IndexedResultCardItem[] = [];
  const unmatched: IndexedResultCardItem[] = [];

  items.forEach((item, index) => {
    const entry = { index, item };
    if (item.duplicate) {
      duplicate.push(entry);
      return;
    }
    if (item.matched) {
      matched.push(entry);
      return;
    }
    unmatched.push(entry);
  });

  return { duplicate, matched, unmatched };
}

/** 相同发票号的条目合并为一组展示（保留原始索引） */
export function groupIndexedResultCardItemsByInvoice(
  entries: IndexedResultCardItem[],
): ResultCardDisplayGroup[] {
  const groups: ResultCardDisplayGroup[] = [];
  const invoiceToGroupIndex = new Map<string, number>();

  for (const { index, item } of entries) {
    const invoiceNumber = String(item.invoice_number ?? '').trim();
    if (!invoiceNumber) {
      groups.push({
        indices: [index],
        representativeIndex: index,
        representative: item,
        items: [item],
      });
      continue;
    }

    const existingGroupIndex = invoiceToGroupIndex.get(invoiceNumber);
    if (existingGroupIndex == null) {
      invoiceToGroupIndex.set(invoiceNumber, groups.length);
      groups.push({
        indices: [index],
        representativeIndex: index,
        representative: item,
        items: [item],
      });
      continue;
    }

    const group = groups[existingGroupIndex];
    group.indices.push(index);
    group.items.push(item);
    if (!item.duplicate) {
      group.representative = item;
      group.representativeIndex = index;
    }
  }

  return groups;
}

export function groupResultCardItemsByInvoice(
  items: ResultCardItem[],
): ResultCardDisplayGroup[] {
  return groupIndexedResultCardItemsByInvoice(
    items.map((item, index) => ({ index, item })),
  );
}

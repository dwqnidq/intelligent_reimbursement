import {
  groupIndexedResultCardItemsByInvoice,
  groupResultCardItemsByInvoice,
  partitionResultCardItems,
} from './feishu-result-group.util';
import type { ResultCardItem } from './feishu-card.builder';

function item(
  partial: Partial<ResultCardItem> & Pick<ResultCardItem, 'file_name'>,
): ResultCardItem {
  return {
    matched: false,
    ...partial,
  };
}

describe('feishu-result-group.util', () => {
  it('merges items with same invoice number into one group', () => {
    const groups = groupResultCardItemsByInvoice([
      item({
        file_name: 'a.jpeg',
        invoice_number: '123',
        duplicate: true,
        amount: 88,
      }),
      item({
        file_name: 'a.pdf',
        invoice_number: '123',
        duplicate: true,
      }),
      item({
        file_name: 'b.pdf',
        invoice_number: '456',
        duplicate: true,
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].items.map((entry) => entry.file_name)).toEqual([
      'a.jpeg',
      'a.pdf',
    ]);
  });

  it('preserves original indices when grouping duplicate subset', () => {
    const groups = groupIndexedResultCardItemsByInvoice([
      { index: 2, item: item({ file_name: 'a.jpeg', invoice_number: '123', duplicate: true }) },
      { index: 5, item: item({ file_name: 'a.pdf', invoice_number: '123', duplicate: true }) },
    ]);

    expect(groups[0].indices).toEqual([2, 5]);
    expect(groups[0].representativeIndex).toBe(2);
  });

  it('partitions items into duplicate, matched and unmatched', () => {
    const partitioned = partitionResultCardItems([
      item({ file_name: 'dup.pdf', duplicate: true }),
      item({ file_name: 'ok.pdf', matched: true, duplicate: false }),
      item({ file_name: 'bad.pdf', matched: false, duplicate: false }),
    ]);

    expect(partitioned.duplicate).toHaveLength(1);
    expect(partitioned.matched).toHaveLength(1);
    expect(partitioned.unmatched).toHaveLength(1);
  });
});

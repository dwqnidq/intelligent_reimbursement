import {
  listMissingUnmatchedTypeIndexes,
  unmatchedTypeSelectionHint,
} from './feishu-submit-selection.util';

describe('feishu-submit-selection.util', () => {
  it('lists unmatched items without type selection', () => {
    expect(
      listMissingUnmatchedTypeIndexes(
        [
          { matched: true },
          { matched: false },
          { matched: false, duplicate: true },
          { matched: false },
        ],
        { type_1: 't1', type_3: '' },
      ),
    ).toEqual([3]);
  });

  it('returns empty when every unmatched item has a type', () => {
    expect(
      listMissingUnmatchedTypeIndexes(
        [{ matched: false }, { matched: false }],
        { type_0: 'a', type_1: 'b' },
      ),
    ).toEqual([]);
  });

  it('builds toast hint by missing count', () => {
    expect(unmatchedTypeSelectionHint(0)).toBe('');
    expect(unmatchedTypeSelectionHint(1)).toBe(
      '请为未匹配发票选择报销类型后再提交',
    );
    expect(unmatchedTypeSelectionHint(2)).toBe(
      '还有 2 张未匹配发票未选择报销类型，请选择后再提交',
    );
  });
});

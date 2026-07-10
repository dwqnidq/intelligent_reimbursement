import { matchReimbursementType } from './feishu-type-matcher';

describe('matchReimbursementType', () => {
  const types = [
    { _id: 't1', label: '差旅交通', name: 'travel', code: 'TRAVEL' },
    { _id: 't2', label: '餐饮招待', name: 'meal', code: 'MEAL' },
  ];

  it('returns unmatched when is_suggested_type is true', () => {
    const result = matchReimbursementType(
      { label: '办公用品', is_suggested_type: true, suggested_type_code: 'OFFICE' },
      types,
    );
    expect(result.matched).toBe(false);
  });

  it('matches by label ignoring case', () => {
    const result = matchReimbursementType({ label: '差旅交通' }, types);
    expect(result).toEqual({
      matched: true,
      category_id: 't1',
      category_label: '差旅交通',
    });
  });

  it('matches by name or code', () => {
    expect(matchReimbursementType({ label: 'meal' }, types).category_id).toBe('t2');
    expect(matchReimbursementType({ label: 'TRAVEL' }, types).category_id).toBe('t1');
  });

  it('returns unmatched when no type matches', () => {
    const result = matchReimbursementType({ label: '未知类型' }, types);
    expect(result.matched).toBe(false);
  });
});

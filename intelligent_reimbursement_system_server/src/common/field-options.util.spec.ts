import {
  normalizeFieldOption,
  normalizeFieldOptions,
  normalizeTypeFieldsOptions,
} from './field-options.util';

describe('normalizeFieldOption', () => {
  it('keeps label/value objects', () => {
    expect(normalizeFieldOption({ label: '现金', value: 'cash' })).toEqual({
      label: '现金',
      value: 'cash',
    });
  });

  it('maps plain string to label=value', () => {
    expect(normalizeFieldOption('选项A')).toEqual({
      label: '选项A',
      value: '选项A',
    });
  });

  it('falls back value from label when value missing', () => {
    expect(normalizeFieldOption({ label: '显示名' })).toEqual({
      label: '显示名',
      value: '显示名',
    });
  });

  it('returns null for empty/invalid entries', () => {
    expect(normalizeFieldOption(null)).toBeNull();
    expect(normalizeFieldOption('')).toBeNull();
    expect(normalizeFieldOption({ label: '', value: '' })).toBeNull();
    expect(normalizeFieldOption(123)).toBeNull();
  });
});

describe('normalizeFieldOptions', () => {
  it('normalizes mixed string and object arrays', () => {
    expect(
      normalizeFieldOptions([
        '旧字符串',
        { label: '新标签', value: 'new' },
        { label: '仅标签' },
        '',
        null,
      ]),
    ).toEqual([
      { label: '旧字符串', value: '旧字符串' },
      { label: '新标签', value: 'new' },
      { label: '仅标签', value: '仅标签' },
    ]);
  });

  it('returns empty array for non-array input', () => {
    expect(normalizeFieldOptions(undefined)).toEqual([]);
    expect(normalizeFieldOptions('not-array')).toEqual([]);
  });
});

describe('normalizeTypeFieldsOptions', () => {
  it('normalizes options on each field', () => {
    expect(
      normalizeTypeFieldsOptions([
        {
          key: 'pay',
          label: '支付',
          options: ['现金', { label: '卡', value: 'card' }],
        },
      ]),
    ).toEqual([
      {
        key: 'pay',
        label: '支付',
        options: [
          { label: '现金', value: '现金' },
          { label: '卡', value: 'card' },
        ],
      },
    ]);
  });
});

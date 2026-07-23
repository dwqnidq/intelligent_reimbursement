import {
  formatExtractSkipReason,
  isRecognizableExtractGroup,
  isValidInvoiceNumber,
} from './feishu-extract-group.util';

describe('feishu-extract-group.util', () => {
  it('validates invoice number format', () => {
    expect(isValidInvoiceNumber('12345678')).toBe(true);
    expect(isValidInvoiceNumber('1234567')).toBe(false);
    expect(isValidInvoiceNumber('abc12345678')).toBe(false);
  });

  it('rejects empty extract groups', () => {
    expect(isRecognizableExtractGroup([])).toBe(false);
  });

  it('accepts groups with valid invoice number and fields', () => {
    expect(
      isRecognizableExtractGroup([
        {
          label: '差旅费',
          invoice_number: '12345678901234',
          fields: [{ key: 'amount', value: 10 }],
        },
      ]),
    ).toBe(true);
  });

  it('rejects groups without valid invoice number', () => {
    expect(
      isRecognizableExtractGroup([
        {
          label: '差旅费',
          fields: [{ key: 'amount', value: 10 }],
        },
      ]),
    ).toBe(false);
  });

  it('accepts duplicate rows with valid invoice number', () => {
    expect(
      isRecognizableExtractGroup([
        {
          invoice_number: '12345678901234',
          invoice_duplicate: true,
          fields: [],
          fill_error: '该发票已上传',
        },
      ]),
    ).toBe(true);
  });

  it('rejects fill_error-only placeholder rows', () => {
    expect(
      isRecognizableExtractGroup([
        {
          label: '',
          fields: [],
          fill_error: '全部文件处理完毕仍无可用填单结果',
        },
      ]),
    ).toBe(false);
  });

  it('formats skip reason from fill_error', () => {
    expect(
      formatExtractSkipReason(
        [{ fill_error: '未识别到有效发票号码' }],
        'photo.jpg',
      ),
    ).toBe('photo.jpg: 未识别到有效发票号码');
  });

  it('accepts invoice-number-only rows for unmatched manual type select', () => {
    expect(
      isRecognizableExtractGroup([
        {
          label: '未识别到报销类型',
          invoice_number: '12345678901234',
          fields: [],
        },
      ]),
    ).toBe(true);
  });
});

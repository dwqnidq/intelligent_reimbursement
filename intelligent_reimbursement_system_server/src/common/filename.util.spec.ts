import {
  decodeUploadedFilename,
  isGarbledUploadedFilename,
} from './filename.util';

describe('decodeUploadedFilename', () => {
  it('keeps ASCII filenames unchanged', () => {
    expect(decodeUploadedFilename('invoice.pdf')).toBe('invoice.pdf');
  });

  it('keeps correct UTF-8 Chinese filenames unchanged', () => {
    expect(decodeUploadedFilename('发票.pdf')).toBe('发票.pdf');
  });

  it('fixes latin1-misread UTF-8 filenames', () => {
    const mojibake = Buffer.from('发票.pdf', 'utf8').toString('latin1');
    expect(decodeUploadedFilename(mojibake)).toBe('发票.pdf');
  });

  it('fixes longer Chinese filenames', () => {
    const mojibake = Buffer.from('差旅费报销单-2024年1月.png', 'utf8').toString(
      'latin1',
    );
    expect(decodeUploadedFilename(mojibake)).toBe('差旅费报销单-2024年1月.png');
  });
});

describe('isGarbledUploadedFilename', () => {
  it('detects garbled filenames', () => {
    const mojibake = Buffer.from('发票.pdf', 'utf8').toString('latin1');
    expect(isGarbledUploadedFilename(mojibake)).toBe(true);
  });

  it('does not flag correct filenames', () => {
    expect(isGarbledUploadedFilename('发票.pdf')).toBe(false);
    expect(isGarbledUploadedFilename('invoice.pdf')).toBe(false);
  });
});

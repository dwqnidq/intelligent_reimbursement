import AdmZip from 'adm-zip';
import { extractRecognizableFromZip } from './feishu-zip.util';

function buildZip(entries: Record<string, Buffer | string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    const buf = typeof content === 'string' ? Buffer.from(content) : content;
    zip.addFile(name, buf);
  }
  return zip.toBuffer();
}

describe('extractRecognizableFromZip', () => {
  it('extracts images and pdf, skips other and nested zip', () => {
    const buffer = buildZip({
      'a.pdf': 'pdf-content',
      'nested/b.jpg': 'jpg-content',
      'c.docx': 'doc',
      'inner.zip': 'zip-bytes',
    });

    const result = extractRecognizableFromZip(buffer, {
      maxFiles: 20,
      maxTotalBytes: 100 * 1024 * 1024,
      maxFileBytes: 20 * 1024 * 1024,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.entries.map((e) => e.file_name).sort()).toEqual([
      'a.pdf',
      'nested/b.jpg',
    ]);
    expect(result.skipped.sort()).toEqual(['c.docx', 'inner.zip']);
  });

  it('returns error when exceeding maxFiles', () => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < 21; i++) {
      entries[`f${i}.png`] = 'x';
    }
    const buffer = buildZip(entries);

    const result = extractRecognizableFromZip(buffer, {
      maxFiles: 20,
      maxTotalBytes: 100 * 1024 * 1024,
      maxFileBytes: 20 * 1024 * 1024,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/20/);
  });

  it('allows unlimited files when maxFiles is 0', () => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < 25; i++) {
      entries[`f${i}.png`] = 'x';
    }
    const buffer = buildZip(entries);

    const result = extractRecognizableFromZip(buffer, {
      maxFiles: 0,
      maxTotalBytes: 100 * 1024 * 1024,
      maxFileBytes: 20 * 1024 * 1024,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(25);
  });

  it('skips macOS zip metadata entries', () => {
    const buffer = buildZip({
      'invoices/a.pdf': 'pdf',
      'invoices/b.jpg': 'jpg',
      '__MACOSX/invoices/._a.pdf': 'meta',
      'invoices/._b.jpg': 'meta2',
      'invoices/.DS_Store': 'ds',
    });

    const result = extractRecognizableFromZip(buffer, {
      maxFiles: 0,
      maxTotalBytes: 0,
      maxFileBytes: 20 * 1024 * 1024,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((e) => e.file_name).sort()).toEqual([
      'invoices/a.pdf',
      'invoices/b.jpg',
    ]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        '__MACOSX/invoices/._a.pdf',
        'invoices/._b.jpg',
        'invoices/.DS_Store',
      ]),
    );
  });

  it('skips duplicate basenames inside zip', () => {
    const buffer = buildZip({
      'dir-a/invoice.pdf': 'pdf-a',
      'dir-b/invoice.pdf': 'pdf-b',
      'dir-c/other.jpg': 'jpg',
    });

    const result = extractRecognizableFromZip(buffer, {
      maxFiles: 0,
      maxTotalBytes: 0,
      maxFileBytes: 20 * 1024 * 1024,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((e) => e.file_name)).toEqual([
      'dir-a/invoice.pdf',
      'dir-c/other.jpg',
    ]);
    expect(result.skipped).toContain('dir-b/invoice.pdf: 重复文件名（invoice.pdf），已跳过');
  });
});

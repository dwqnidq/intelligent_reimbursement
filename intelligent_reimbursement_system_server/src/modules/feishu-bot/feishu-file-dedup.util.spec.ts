import {
  deduplicateByFileName,
  duplicateFileNameKey,
} from './feishu-file-dedup.util';

describe('feishu-file-dedup.util', () => {
  it('treats same basename in different paths as duplicate', () => {
    const skipped: string[] = [];
    const result = deduplicateByFileName(
      [
        { file_name: 'a/11.4.pdf', buffer: Buffer.from('1') },
        { file_name: 'b/11.4.pdf', buffer: Buffer.from('2') },
      ],
      skipped,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.file_name).toBe('a/11.4.pdf');
    expect(skipped[0]).toContain('重复文件名');
  });

  it('keeps files with different basenames', () => {
    const skipped: string[] = [];
    const result = deduplicateByFileName(
      [
        { file_name: '11.4.pdf', buffer: Buffer.from('1') },
        { file_name: '11.4.jpeg', buffer: Buffer.from('2') },
        { file_name: '11.40.pdf', buffer: Buffer.from('3') },
      ],
      skipped,
    );

    expect(result).toHaveLength(3);
    expect(skipped).toEqual([]);
  });

  it('deduplicates case-insensitively', () => {
    expect(duplicateFileNameKey('A.PDF')).toBe(duplicateFileNameKey('a.pdf'));
  });
});

import { listPendingSourceFiles } from './feishu-pending-source.util';

describe('feishu-pending-source.util', () => {
  it('returns sources without recognized file_key', () => {
    const pending = listPendingSourceFiles(
      [
        { file_key: 'k1', kind: 'pdf', file_name: 'a.pdf' },
        { file_key: 'k2', kind: 'image', file_name: 'b.jpg' },
        { file_key: 'k3', kind: 'folder', file_name: 'dir' },
      ],
      [{ file_key: 'k1', file_name: 'a.pdf' }],
    );

    expect(pending).toEqual([{ file_key: 'k2', kind: 'image', file_name: 'b.jpg' }]);
  });

  it('treats zip as processed when any item shares its file_key', () => {
    const pending = listPendingSourceFiles(
      [{ file_key: 'zip-key', kind: 'zip', file_name: 'pack.zip' }],
      [
        { file_key: 'zip-key', file_name: 'pack.zip/inv1.pdf' },
        { file_key: 'zip-key', file_name: 'pack.zip/inv2.pdf' },
      ],
    );

    expect(pending).toEqual([]);
  });
});

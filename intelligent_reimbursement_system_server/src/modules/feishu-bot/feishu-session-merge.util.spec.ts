import {
  mergeSourceFiles,
  mergeUniqueStrings,
} from './feishu-session-merge.util';

describe('feishu-session-merge.util', () => {
  it('mergeSourceFiles appends only new file_key/message_id pairs', () => {
    const merged = mergeSourceFiles(
      [
        {
          file_key: 'zip1',
          file_name: 'a.zip',
          kind: 'zip',
          message_id: 'msg-1',
          resource_type: 'file',
        },
      ],
      [
        {
          file_key: 'zip1',
          file_name: 'a.zip',
          kind: 'zip',
          message_id: 'msg-1',
          resource_type: 'file',
        },
        {
          file_key: 'f2',
          file_name: 'b.pdf',
          kind: 'pdf',
          message_id: 'msg-2',
          resource_type: 'file',
        },
      ],
    );

    expect(merged).toHaveLength(2);
    expect(merged.map((f) => f.file_name)).toEqual(['a.zip', 'b.pdf']);
  });

  it('mergeUniqueStrings deduplicates skipped names', () => {
    expect(mergeUniqueStrings(['a'], ['a', 'b'])).toEqual(['a', 'b']);
  });
});

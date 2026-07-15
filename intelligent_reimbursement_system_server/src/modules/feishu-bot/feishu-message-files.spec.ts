import {
  extractFileName,
  isLikelyFileMessage,
  parseFeishuMessageFiles,
} from './feishu-message-files';

describe('feishu-message-files', () => {
  it('uses file_name from file messages', () => {
    const result = parseFeishuMessageFiles({
      message_id: 'msg-1',
      message_type: 'file',
      content: JSON.stringify({
        file_key: 'file_abc',
        file_name: '11.4.jepg',
      }),
    });

    expect(result.sourceFiles).toEqual([
      {
        file_key: 'file_abc',
        file_name: '11.4.jepg',
        kind: 'image',
        message_id: 'msg-1',
        resource_type: 'file',
      },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it('supports media messages with file_name', () => {
    const result = parseFeishuMessageFiles({
      message_id: 'msg-2',
      message_type: 'media',
      content: JSON.stringify({
        file_key: 'file_video',
        file_name: '11.4.jepg',
      }),
    });

    expect(result.sourceFiles[0]?.file_name).toBe('11.4.jepg');
    expect(result.sourceFiles[0]?.kind).toBe('image');
    expect(result.sourceFiles[0]?.resource_type).toBe('file');
  });

  it('parses folder messages', () => {
    const result = parseFeishuMessageFiles({
      message_id: 'msg-folder',
      message_type: 'folder',
      content: JSON.stringify({
        file_key: 'folder_abc',
        file_name: '发票文件夹',
      }),
    });

    expect(result.sourceFiles).toEqual([
      {
        file_key: 'folder_abc',
        file_name: '发票文件夹',
        kind: 'folder',
        message_id: 'msg-folder',
        resource_type: 'file',
      },
    ]);
  });

  it('does not synthesize image_key based names for image messages', () => {
    const result = parseFeishuMessageFiles({
      message_id: 'msg-3',
      message_type: 'image',
      content: JSON.stringify({
        image_key: 'img_v2_abc',
      }),
    });

    expect(result.sourceFiles[0]?.file_name).toBe('未命名图片.jpg');
    expect(result.sourceFiles[0]?.resource_type).toBe('image');
    expect(result.sourceFiles[0]?.file_name).not.toContain('img_v2_abc');
  });

  it('extractFileName checks alternate keys', () => {
    expect(extractFileName({ fileName: 'a.pdf' })).toBe('a.pdf');
    expect(extractFileName({ name: 'b.png' })).toBe('b.png');
  });

  it('isLikelyFileMessage detects file types without full parse', () => {
    expect(
      isLikelyFileMessage({
        message_type: 'file',
        content: JSON.stringify({ file_key: 'k1' }),
      }),
    ).toBe(true);
    expect(
      isLikelyFileMessage({
        message_type: 'text',
        content: JSON.stringify({ text: 'hello' }),
      }),
    ).toBe(false);
  });
});

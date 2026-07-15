import { FeishuMessageBatchService } from './feishu-message-batch.service';

describe('FeishuMessageBatchService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('merges multiple file messages into one batch flush', async () => {
    const flushed: unknown[] = [];
    const service = new FeishuMessageBatchService({
      get: () => '200',
    } as never);

    const onFlush = jest.fn(async (payload) => {
      flushed.push(payload);
    });

    service.enqueue(
      'ou_1',
      'oc_1',
      'msg-1',
      {
        sourceFiles: [
          {
            file_key: 'f1',
            file_name: 'a.pdf',
            kind: 'pdf',
            message_id: 'msg-1',
            resource_type: 'file',
          },
        ],
        skipped: [],
      },
      onFlush,
    );
    service.enqueue(
      'ou_1',
      'oc_1',
      'msg-2',
      {
        sourceFiles: [
          {
            file_key: 'f2',
            file_name: 'b.jpg',
            kind: 'image',
            message_id: 'msg-2',
            resource_type: 'file',
          },
        ],
        skipped: [],
      },
      onFlush,
    );

    jest.advanceTimersByTime(199);
    expect(onFlush).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await Promise.resolve();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(flushed[0]).toMatchObject({
      messageIds: ['msg-1', 'msg-2'],
      sourceFiles: [
        expect.objectContaining({ file_name: 'a.pdf' }),
        expect.objectContaining({ file_name: 'b.jpg' }),
      ],
    });
  });

  it('cancel clears pending batch without flushing', () => {
    const service = new FeishuMessageBatchService({
      get: () => '200',
    } as never);
    const onFlush = jest.fn();

    service.enqueue(
      'ou_1',
      'oc_1',
      'msg-1',
      {
        sourceFiles: [
          {
            file_key: 'f1',
            file_name: 'a.pdf',
            kind: 'pdf',
            message_id: 'msg-1',
            resource_type: 'file',
          },
        ],
        skipped: [],
      },
      onFlush,
    );
    service.cancel('ou_1', 'oc_1');
    jest.advanceTimersByTime(500);
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('uses 500ms as default collect window', () => {
    const service = new FeishuMessageBatchService({
      get: () => undefined,
    } as never);
    const onFlush = jest.fn();

    expect(
      service.enqueue(
        'ou_1',
        'oc_1',
        'msg-1',
        {
          sourceFiles: [
            {
              file_key: 'f1',
              file_name: 'a.pdf',
              kind: 'pdf',
              message_id: 'msg-1',
              resource_type: 'file',
            },
          ],
          skipped: [],
        },
        onFlush,
      ),
    ).toBe(true);

    expect(onFlush).not.toHaveBeenCalled();
    jest.advanceTimersByTime(499);
    expect(onFlush).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('returns false when appending to an existing batch', () => {
    const service = new FeishuMessageBatchService({
      get: () => '200',
    } as never);
    const onFlush = jest.fn();
    const payload = {
      sourceFiles: [
        {
          file_key: 'f1',
          file_name: 'a.pdf',
          kind: 'pdf' as const,
          message_id: 'msg-1',
          resource_type: 'file' as const,
        },
      ],
      skipped: [] as string[],
    };

    expect(service.enqueue('ou_1', 'oc_1', 'msg-1', payload, onFlush)).toBe(
      true,
    );
    expect(service.enqueue('ou_1', 'oc_1', 'msg-2', payload, onFlush)).toBe(
      false,
    );
  });

  it('flushNow immediately merges pending batch', async () => {
    const service = new FeishuMessageBatchService({
      get: () => '200',
    } as never);
    const onFlush = jest.fn(async () => undefined);
    const payload = {
      sourceFiles: [
        {
          file_key: 'f1',
          file_name: 'a.pdf',
          kind: 'pdf' as const,
          message_id: 'msg-1',
          resource_type: 'file' as const,
        },
      ],
      skipped: [] as string[],
    };

    service.enqueue('ou_1', 'oc_1', 'msg-1', payload, onFlush);
    expect(service.hasPending('ou_1', 'oc_1')).toBe(true);

    await service.flushNow('ou_1', 'oc_1');

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(service.hasPending('ou_1', 'oc_1')).toBe(false);
  });
});

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ParsedSourceFile } from './feishu-message-files';

export type MessageBatchPayload = {
  openId: string;
  chatId: string;
  messageIds: string[];
  sourceFiles: ParsedSourceFile[];
  skipped: string[];
};

/** 连续多条文件消息合并窗口，降低首发卡竞态 */
export const DEFAULT_FEISHU_BATCH_COLLECT_MS = 500;

type PendingBatch = {
  openId: string;
  chatId: string;
  messageIds: string[];
  sourceFiles: ParsedSourceFile[];
  skipped: string[];
  timer: ReturnType<typeof setTimeout>;
  onFlush: (payload: MessageBatchPayload) => Promise<void>;
};

@Injectable()
export class FeishuMessageBatchService {
  private readonly logger = new Logger(FeishuMessageBatchService.name);
  private readonly collectMs: number;
  private readonly pending = new Map<string, PendingBatch>();

  constructor(private readonly config: ConfigService) {
    this.collectMs = Number(
      this.config.get<string>('FEISHU_BATCH_COLLECT_MS') ??
        DEFAULT_FEISHU_BATCH_COLLECT_MS,
    );
  }

  cancel(openId: string, chatId: string): void {
    const key = `${openId}:${chatId}`;
    const batch = this.pending.get(key);
    if (!batch) return;
    clearTimeout(batch.timer);
    this.pending.delete(key);
  }

  hasPending(openId: string, chatId: string): boolean {
    return this.pending.has(`${openId}:${chatId}`);
  }

  /** 立即刷新队列（识别开始前调用，避免 cancel 丢弃未合并文件） */
  async flushNow(openId: string, chatId: string): Promise<void> {
    const key = `${openId}:${chatId}`;
    const batch = this.pending.get(key);
    if (!batch) return;
    clearTimeout(batch.timer);
    await this.flush(key);
  }

  enqueue(
    openId: string,
    chatId: string,
    messageId: string,
    parsed: { sourceFiles: ParsedSourceFile[]; skipped: string[] },
    onFlush: (payload: MessageBatchPayload) => Promise<void>,
  ): boolean {
    const key = `${openId}:${chatId}`;
    let batch = this.pending.get(key);
    const isNewBatch = !batch;
    if (!batch) {
      batch = {
        openId,
        chatId,
        messageIds: [],
        sourceFiles: [],
        skipped: [],
        timer: setTimeout(() => void this.flush(key), this.collectMs),
        onFlush,
      };
      this.pending.set(key, batch);
    } else {
      clearTimeout(batch.timer);
      batch.timer = setTimeout(() => void this.flush(key), this.collectMs);
    }

    batch.messageIds.push(messageId);
    batch.sourceFiles.push(...parsed.sourceFiles);
    batch.skipped.push(...parsed.skipped);

    this.logger.log(
      `归入批量队列 key=${key} 当前 ${batch.sourceFiles.length} 个文件，${this.collectMs}ms 后合并发送确认卡`,
    );
    return isNewBatch;
  }

  private async flush(key: string): Promise<void> {
    const batch = this.pending.get(key);
    if (!batch) return;
    this.pending.delete(key);
    clearTimeout(batch.timer);

    const payload: MessageBatchPayload = {
      openId: batch.openId,
      chatId: batch.chatId,
      messageIds: batch.messageIds,
      sourceFiles: batch.sourceFiles,
      skipped: batch.skipped,
    };

    this.logger.log(
      `批量队列刷新 key=${key} files=${payload.sourceFiles.length} messages=${payload.messageIds.length}`,
    );

    try {
      await batch.onFlush(payload);
    } catch (err) {
      this.logger.error(`批量队列刷新失败 key=${key}`, err);
    }
  }
}

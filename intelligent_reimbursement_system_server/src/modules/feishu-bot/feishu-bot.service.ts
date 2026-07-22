import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import {
  BotRecognizedItem,
  BotSession,
  BotSessionStatus,
  BotSourceFile,
} from '../../schemas/bot_session.schema';
import { FeishuApiClient } from './feishu-api.client';
import { FeishuIdentityService } from './feishu-identity.service';
import { FeishuMessageBatchService } from './feishu-message-batch.service';
import {
  folderSkipMessage,
  isExtractableContainer,
  isRecognizableKind,
} from './feishu-file.classifier';
import {
  isLikelyFileMessage,
  isSyntheticFileName,
  mergeMessageContent,
  parseFeishuMessageFiles,
  type ParsedSourceFile,
} from './feishu-message-files';
import {
  extractRecognizableFromZip,
  type ZipExtractOptions,
} from './feishu-zip.util';
import { matchReimbursementType } from './feishu-type-matcher';
import {
  buildApprovalSkippedCard,
  buildConfirmCard,
  buildConfirmCardContent,
  buildNoRecognizableCard,
  buildProfileCard,
  buildProfileCardContent,
  buildProgressCard,
  buildResultCard,
  buildResultCardContent,
  buildSuccessCard,
  type ConfirmCardStats,
  type FileChip,
  type ResultCardMode,
  type SystemTypeOption,
} from './feishu-card.builder';
import { AiService } from '../ai/ai.service';
import { FileService } from '../file/file.service';
import { ReimbursementService } from '../reimbursement/reimbursement.service';
import { ReimbursementTypeService } from '../reimbursement-type/reimbursement-type.service';
import { CompanyService } from '../company/company.service';
import { UserService } from '../user/user.service';
import { User } from '../../schemas/user.schema';
import { FeishuUser } from '../../schemas/feishu_user.schema';
import { CreateReimbursementDto } from '../reimbursement/dto/create-reimbursement.dto';
import {
  buildCardActionResponse,
  parseCardActionBody,
  wrapCallbackCard,
} from './feishu-card-action.util';
import { deduplicateByFileName } from './feishu-file-dedup.util';
import {
  mergeSourceFiles,
  mergeUniqueStrings,
} from './feishu-session-merge.util';
import { listPendingSourceFiles } from './feishu-pending-source.util';
import { enrichRecognizedAmounts } from './feishu-recognized-enrich.util';
import {
  formatExtractSkipReason,
  isRecognizableExtractGroup,
} from './feishu-extract-group.util';
import { ApprovalRecordService } from '../approval-record/approval-record.service';
import { ApprovalNotifyService } from '../approval-notify/approval-notify.service';
import { PromiseChainLock } from './feishu-promise-chain-lock.util';
import { extractApprovalRejectReason } from './feishu-approval-reject-reason.util';

const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_ZIP_TOTAL_BYTES = 100 * 1024 * 1024;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
/** 距上次发送确认卡超过该时间则发新卡（否则原地更新） */
const UPLOAD_CARD_UPDATE_WINDOW_MS = 15 * 60 * 1000;
/** 合并连发文件触发的确认卡刷新，避免并发 send 出多张卡 */
const UPLOAD_CARD_DEBOUNCE_MS = 300;
const UPLOAD_SESSION_STATUSES: BotSessionStatus[] = [
  'awaiting_upload',
  'awaiting_confirm',
];
const RECOGNITION_START_ACTIONS = new Set([
  'upload_complete',
  'confirm_reimburse',
]);

function isUploadSessionStatus(status: BotSessionStatus): boolean {
  return UPLOAD_SESSION_STATUSES.includes(status);
}

type UploadCardSource = 'awaiting_upload' | 'awaiting_confirm';

function resolveUploadCardSource(
  session: BotSession,
): UploadCardSource | 'awaiting_submit' | 'awaiting_profile' {
  if (session.status === 'awaiting_submit') return 'awaiting_submit';
  if (session.status === 'awaiting_profile') return 'awaiting_profile';
  return 'awaiting_upload';
}

type IncomingFilePayload = {
  openId: string;
  chatId: string;
  messageIds: string[];
  sourceFiles: ParsedSourceFile[];
  skipped: string[];
};

type DownloadedFile = {
  file_name: string;
  buffer: Buffer;
  mime: string;
  file_key?: string;
};

type UploadConfirmCacheEntry = {
  sessionId: string;
  confirmMessageId: string;
  openId: string;
  chatId: string;
  stats: ConfirmCardStats;
  chips: FileChip[];
};

type ExtractRow = {
  label?: string;
  fields?: { key: string; value?: unknown; is_calculate?: boolean }[];
  is_suggested_type?: boolean;
  suggested_type_code?: string;
  invoice_number?: string;
  invoice_title?: string;
  invoice_date?: string;
  issuer?: string;
  invoice_duplicate?: boolean;
  fill_error?: string;
};

@Injectable()
export class FeishuBotService {
  private readonly logger = new Logger(FeishuBotService.name);
  private readonly uploadCardRefreshTimers = new Map<string, NodeJS.Timeout>();
  private readonly chatLockTails = new Map<string, Promise<void>>();
  /** 同一会话确认卡发送/更新串行化，避免双发 */
  private readonly uploadCardPublishLock = new PromiseChainLock();
  private readonly incrementalRecognitionTails = new Map<
    string,
    Promise<void>
  >();
  /** 收到新文件后、清单合并完成前，强制禁用「已全部上传」 */
  private readonly uploadSyncPendingSessions = new Set<string>();
  /** 补传识别进行中，保持结果卡提交按钮禁用 */
  private readonly resultCardSyncPendingSessions = new Set<string>();
  /** 上传确认卡内存索引：收到文件时零 DB 延迟锁定按钮 */
  private readonly uploadConfirmCache = new Map<string, UploadConfirmCacheEntry>();
  /** 当前对话正在处理的文件消息数 */
  private readonly chatIncomingFileDepth = new Map<string, number>();
  /** 用户已取消或应中止的识别任务（防止后台识别把状态写回 recognizing） */
  private readonly abortedRecognitionSessions = new Set<string>();
  /** 0 表示不限制可识别文件数量 */
  private readonly maxRecognizableFiles: number;
  private readonly maxFileBytes: number;
  private readonly maxZipTotalBytes: number;

  constructor(
    @InjectModel(BotSession.name)
    private readonly sessionModel: Model<BotSession>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(FeishuUser.name)
    private readonly feishuUserModel: Model<FeishuUser>,
    private readonly config: ConfigService,
    private readonly feishuApi: FeishuApiClient,
    private readonly messageBatch: FeishuMessageBatchService,
    private readonly identity: FeishuIdentityService,
    private readonly aiService: AiService,
    private readonly fileService: FileService,
    private readonly reimbursementService: ReimbursementService,
    private readonly typeService: ReimbursementTypeService,
    private readonly companyService: CompanyService,
    private readonly userService: UserService,
    @Optional()
    private readonly approvalRecordService?: ApprovalRecordService,
    @Optional()
    private readonly approvalNotify?: ApprovalNotifyService,
  ) {
    this.maxRecognizableFiles = Number(
      this.config.get<string>('FEISHU_MAX_RECOGNIZABLE_FILES') ?? 0,
    );
    this.maxFileBytes = Number(
      this.config.get<string>('FEISHU_MAX_FILE_BYTES') ??
        DEFAULT_MAX_FILE_BYTES,
    );
    this.maxZipTotalBytes = Number(
      this.config.get<string>('FEISHU_MAX_ZIP_TOTAL_BYTES') ??
        DEFAULT_MAX_ZIP_TOTAL_BYTES,
    );
  }

  private getZipExtractOptions(): ZipExtractOptions {
    return {
      maxFiles: this.maxRecognizableFiles,
      maxTotalBytes: this.maxZipTotalBytes,
      maxFileBytes: this.maxFileBytes,
    };
  }

  handleEventHttp(req: Request, res: Response): void {
    const body = req.body as {
      challenge?: string;
      token?: string;
      header?: { token?: string; event_type?: string };
      event?: unknown;
    };

    if (body?.challenge) {
      res.json({ challenge: body.challenge });
      return;
    }

    const token = body.header?.token ?? body.token;
    const expected = this.config.get<string>('FEISHU_VERIFICATION_TOKEN');
    if (expected && token && token !== expected) {
      res.status(401).send('invalid token');
      return;
    }

    res.status(200).send();

    if (!this.feishuApi.isEnabled()) return;

    setImmediate(() => {
      void this.processEventBody(body as Parameters<FeishuBotService['processEventBody']>[0]).catch((err) => {
        this.logger.error('处理飞书事件失败', err);
      });
    });
  }

  /** 长连接 im.message.receive_v1 */
  async handleIncomingMessage(data: {
    message?: {
      message_id?: string;
      chat_id?: string;
      message_type?: string;
      content?: string;
    };
    sender?: { sender_id?: { open_id?: string } };
  }): Promise<void> {
    const message = data.message;
    const openId = data.sender?.sender_id?.open_id;
    if (!message?.chat_id || !message.message_id || !openId) {
      this.logger.warn(
        `忽略飞书消息：缺少必要字段 type=${message?.message_type ?? 'unknown'}`,
      );
      return;
    }

    this.logger.log(
      `收到飞书消息 type=${message.message_type} chat=${message.chat_id}`,
    );

    await this.processIncomingMessage({
      message_id: message.message_id,
      chat_id: message.chat_id,
      message_type: message.message_type,
      content: message.content,
      open_id: openId,
    });
  }

  /** 长连接 card.action.trigger 或 HTTP 卡片回调 */
  async handleCardAction(body: Record<string, unknown>): Promise<void> {
    const parsed = parseCardActionBody(body);
    if (
      parsed.actionName === 'approval_approve' ||
      parsed.actionName === 'approval_reject'
    ) {
      await this.handleApprovalCardAction(body);
      return;
    }
    if (
      parsed.actionName === 'cancel_reimburse' ||
      parsed.actionName === 'cancel_submit'
    ) {
      await this.handleCancelSession(body);
      return;
    }
    await this.processCardAction(body);
  }

  /** 飞书审批卡：通过 / 驳回 */
  async handleApprovalCardAction(
    body: Record<string, unknown>,
  ): Promise<{ card?: unknown; toastContent?: string; ok?: boolean } | null> {
    const parsed = parseCardActionBody(body);
    const { actionName, openId, approvalRecordId } = parsed;
    if (!openId || !approvalRecordId || !this.approvalRecordService) {
      this.logger.warn('审批卡片回调缺少参数或审批服务未注入');
      return {
        ok: false,
        toastContent: '审批服务暂不可用',
      };
    }

    const feishuUser = await this.feishuUserModel.findOne({ open_id: openId });
    if (!feishuUser?.uid) {
      return { ok: false, toastContent: '未绑定系统账号，无法审批' };
    }

    try {
      if (actionName === 'approval_approve') {
        const { meta } = await this.approvalRecordService.approve(
          approvalRecordId,
          String(feishuUser.uid),
        );
        const resolve = {
          kind: (meta.resolveKind || 'approved') as
            | 'approved'
            | 'self_done'
            | 'rejected',
          byName: meta.approvedByName,
        };
        const built =
          (await this.approvalNotify?.buildResolvedCardForRecord(
            approvalRecordId,
            resolve,
          )) ?? buildApprovalSkippedCard({
            resolve,
            applicantName: '申请人',
            category: '',
            amount: 0,
          });
        return {
          ok: true,
          toastContent: '已通过',
          card: built.card,
        };
      }
      if (actionName === 'approval_reject') {
        const rejectReason = extractApprovalRejectReason(body);
        if (!rejectReason) {
          return {
            ok: false,
            toastContent: '请填写驳回原因',
          };
        }
        const { meta } = await this.approvalRecordService.reject(
          approvalRecordId,
          String(feishuUser.uid),
          rejectReason,
        );
        const resolve = {
          kind: 'rejected' as const,
          byName: meta.approvedByName || '已驳回',
        };
        const built =
          (await this.approvalNotify?.buildResolvedCardForRecord(
            approvalRecordId,
            resolve,
          )) ?? buildApprovalSkippedCard({
            resolve,
            applicantName: '申请人',
            category: '',
            amount: 0,
          });
        return {
          ok: true,
          toastContent: '已驳回',
          card: built.card,
        };
      }
    } catch (err) {
      const nestMsg = (err as { response?: { message?: string | string[] } })
        ?.response?.message;
      const msg = Array.isArray(nestMsg)
        ? nestMsg.join('；')
        : nestMsg || (err as Error)?.message || '审批失败';
      this.logger.warn(`飞书审批卡处理失败: ${msg}`);
      return { ok: false, toastContent: msg };
    }
    return null;
  }

  /** 取消会话并禁用当前阶段卡片按钮 */
  async handleCancelSession(
    body: Record<string, unknown>,
  ): Promise<{ card?: unknown } | null> {
    const parsed = parseCardActionBody(body);
    const { sessionId, openId } = parsed;
    if (!openId || !sessionId) return null;

    const session = await this.sessionModel.findOne({ session_id: sessionId });
    if (!session || session.open_id !== openId) {
      this.logger.warn(`忽略取消：会话不存在 session=${sessionId}`);
      return null;
    }

    const cancellable: BotSessionStatus[] = [
      'awaiting_upload',
      'awaiting_confirm',
      'recognizing',
      'awaiting_submit',
      'awaiting_profile',
    ];
    const cardSource =
      session.status === 'cancelled'
        ? this.inferActiveCardSource(session)
        : session.message_ids?.result
          ? 'awaiting_submit'
          : resolveUploadCardSource(session);

    if (
      !cancellable.includes(session.status) &&
      session.status !== 'cancelled'
    ) {
      this.logger.warn(
        `忽略取消：会话状态为 ${session.status} session=${sessionId}`,
      );
      return null;
    }

    if (session.status !== 'cancelled') {
      session.status = 'cancelled';
      await session.save();
      this.markRecognitionAborted(sessionId);
      this.incrementalRecognitionTails.delete(sessionId);
      await this.cancelAllRecognizingInChat(session.open_id, session.chat_id);
      this.clearUploadCardPublish(sessionId);
      this.clearUploadSyncPending(sessionId);
      this.clearResultCardSyncPending(sessionId);
      this.uploadConfirmCache.delete(this.chatLockKey(session.open_id, session.chat_id));
      this.chatIncomingFileDepth.delete(this.chatLockKey(session.open_id, session.chat_id));
      this.messageBatch.cancel(session.open_id, session.chat_id);
      this.logger.log(`会话已取消 session=${sessionId}`);
    }

    const payload = await this.buildCancelledCardPayload(session, cardSource);
    if (payload?.messageId) {
      try {
        await this.feishuApi.updateInteractiveCard(payload.messageId, {
          card: payload.card,
        });
      } catch (err) {
        this.logger.warn(`更新已取消卡片失败 session=${sessionId}`, err);
      }
    }

    return payload ? { card: payload.card } : null;
  }

  /** @deprecated 使用 handleCancelSession */
  async handleCancelReimburse(
    body: Record<string, unknown>,
  ): Promise<{ card?: unknown } | null> {
    return this.handleCancelSession(body);
  }

  private inferActiveCardSource(
    session: BotSession,
  ): UploadCardSource | 'awaiting_submit' | 'awaiting_profile' {
    if (session.message_ids?.result) return 'awaiting_submit';
    if (session.message_ids?.profile) return 'awaiting_profile';
    return 'awaiting_upload';
  }

  private async buildCancelledCardPayload(
    session: BotSession,
    source: UploadCardSource | 'awaiting_submit' | 'awaiting_profile',
  ): Promise<{ card: unknown; messageId?: string } | null> {
    switch (source) {
      case 'awaiting_upload':
      case 'awaiting_confirm':
        return {
          card: this.buildConfirmCardForSession(session, { cancelled: true }),
          messageId: session.message_ids?.confirm,
        };
      case 'awaiting_submit':
        return {
          card: await this.buildResultCardForSession(session, { cancelled: true }),
          messageId: session.message_ids?.result,
        };
      case 'awaiting_profile': {
        return {
          card: await this.buildProfileCardForSession(session, { cancelled: true }),
          messageId: session.message_ids?.profile,
        };
      }
      default:
        return null;
    }
  }

  private async updateSessionCard(
    session: BotSession,
    messageId: string | undefined,
    card: unknown,
  ) {
    if (!messageId) return;
    try {
      await this.feishuApi.updateInteractiveCard(messageId, { card });
    } catch (err) {
      this.logger.warn(
        `更新卡片失败 session=${session.session_id} message=${messageId}`,
        err,
      );
    }
  }

  private async fetchTypeOptions(userId: string): Promise<SystemTypeOption[]> {
    const types = await this.typeService.findAll(userId);
    return types.map((t) => ({
      id: String(t._id),
      label: String(t.label ?? (t as { name?: string }).name ?? t.code ?? ''),
    }));
  }

  private mapRecognizedToCardItems(items: BotRecognizedItem[]) {
    return items.map((item) => ({
      file_name: item.file_name,
      category_label: item.matched
        ? item.category_label
        : String(item.category_label ?? '').trim() || '未识别到报销类型',
      matched: item.matched,
      amount: item.amount,
      invoice_number: item.invoice_number,
      invoice_title: item.invoice_title,
      invoice_date: item.invoice_date,
      issuer: item.issuer,
      duplicate: item.duplicate,
    }));
  }

  private async buildResultCardForSession(
    session: BotSession,
    options?: {
      cancelled?: boolean;
      locked?: boolean;
      lockedReason?: string;
    },
  ) {
    const mode = this.resolveResultMode(session.recognized_items);
    const typeOptions =
      session.user_id && !options?.locked && !options?.cancelled
        ? await this.fetchTypeOptions(session.user_id)
        : [];
    return buildResultCardContent(
      session.session_id,
      this.mapRecognizedToCardItems(session.recognized_items),
      session.skipped_names,
      mode,
      { ...options, typeOptions },
    );
  }

  private buildConfirmCardForSession(
    session: BotSession,
    options?: {
      cancelled?: boolean;
      processing?: boolean;
    },
  ) {
    const sourceFiles = session.source_files;
    const recognizable = sourceFiles.filter((f) =>
      isRecognizableKind(f.kind),
    ).length;
    const zipCount = sourceFiles.filter((f) => f.kind === 'zip').length;
    const folderCount = sourceFiles.filter((f) => f.kind === 'folder').length;

    return buildConfirmCardContent(
      session.session_id,
      {
        recognizable: recognizable + zipCount,
        zipCount,
        folderCount,
        skipCount: session.skipped_names.length,
      },
      sourceFiles.map((f) => ({ name: f.file_name, kind: f.kind })),
      options,
    );
  }

  private isUploadCardSyncPending(session: BotSession): boolean {
    return (
      this.uploadSyncPendingSessions.has(session.session_id) ||
      this.isChatReceivingFiles(session.open_id, session.chat_id) ||
      this.isUploadConfirmStillWaiting(
        session.open_id,
        session.chat_id,
        session.session_id,
      )
    );
  }

  private shouldBlockUploadComplete(session: BotSession): boolean {
    return this.isUploadCardSyncPending(session);
  }

  private beginChatFileReceive(chatKey: string): void {
    this.chatIncomingFileDepth.set(
      chatKey,
      (this.chatIncomingFileDepth.get(chatKey) ?? 0) + 1,
    );
  }

  private endChatFileReceive(chatKey: string): void {
    const depth = this.chatIncomingFileDepth.get(chatKey) ?? 0;
    if (depth <= 1) {
      this.chatIncomingFileDepth.delete(chatKey);
      return;
    }
    this.chatIncomingFileDepth.set(chatKey, depth - 1);
  }

  private isChatReceivingFiles(openId: string, chatId: string): boolean {
    return (this.chatIncomingFileDepth.get(this.chatLockKey(openId, chatId)) ?? 0) > 0;
  }

  private registerUploadConfirmCache(
    session: BotSession,
    confirmMessageId: string,
  ): void {
    this.uploadConfirmCache.set(this.chatLockKey(session.open_id, session.chat_id), {
      sessionId: session.session_id,
      confirmMessageId,
      openId: session.open_id,
      chatId: session.chat_id,
      stats: this.buildUploadCardStats(session),
      chips: session.source_files.map((f) => ({
        name: f.file_name,
        kind: f.kind,
      })),
    });
  }

  private ensureUploadConfirmCache(session: BotSession): void {
    const confirmMessageId = session.message_ids?.confirm;
    if (!confirmMessageId) return;
    this.registerUploadConfirmCache(session, confirmMessageId);
  }

  private markUploadSyncPending(sessionId: string): void {
    this.uploadSyncPendingSessions.add(sessionId);
  }

  private clearUploadSyncPending(sessionId: string): void {
    this.uploadSyncPendingSessions.delete(sessionId);
  }

  private clearResultCardSyncPending(sessionId: string): void {
    this.resultCardSyncPendingSessions.delete(sessionId);
  }

  private markResultCardSyncPending(sessionId: string): void {
    this.resultCardSyncPendingSessions.add(sessionId);
  }

  private async lockResultCard(sessionId: string): Promise<void> {
    this.markResultCardSyncPending(sessionId);
    const session = await this.sessionModel.findOne({ session_id: sessionId });
    if (!session || session.status === 'cancelled' || !session.message_ids?.result) {
      return;
    }
    await this.updateSessionCard(
      session,
      session.message_ids.result,
      await this.buildResultCardForSession(session, {
        locked: true,
        lockedReason: '正在识别补传文件…',
      }),
    );
  }

  handleCardHttp(req: Request, res: Response): void {
    const body = req.body as Record<string, unknown>;
    const token = (body.token as string) ?? (body.header as { token?: string })?.token;
    const expected = this.config.get<string>('FEISHU_VERIFICATION_TOKEN');
    if (expected && token && token !== expected) {
      res.status(401).send('invalid token');
      return;
    }

    const parsed = parseCardActionBody(body);
    this.logger.log(
      `收到 HTTP 卡片回调 action=${parsed.actionName ?? 'unknown'} session=${parsed.sessionId ?? '-'}`,
    );

    if (
      parsed.actionName === 'approval_approve' ||
      parsed.actionName === 'approval_reject'
    ) {
      void this.handleApprovalCardAction(body)
        .then((result) => {
          const content = result?.toastContent ?? '处理中…';
          res.status(200).json({
            toast: {
              type: result?.ok ? 'success' : 'error',
              content,
              i18n: { zh_cn: content, en_us: content },
            },
            ...(result?.card
              ? { card: wrapCallbackCard(result.card) }
              : {}),
          });
        })
        .catch((err) => {
          this.logger.error('处理审批卡片回调失败', err);
          res.status(200).json({
            toast: {
              type: 'error',
              content: '审批失败',
              i18n: { zh_cn: '审批失败', en_us: 'Failed' },
            },
          });
        });
      return;
    }

    if (
      parsed.actionName === 'cancel_reimburse' ||
      parsed.actionName === 'cancel_submit'
    ) {
      void this.handleCancelSession(body)
        .then((result) => {
          res
            .status(200)
            .json(buildCardActionResponse(parsed.actionName, result?.card));
        })
        .catch((err) => {
          this.logger.error('处理取消卡片回调失败', err);
          res.status(200).json(buildCardActionResponse(parsed.actionName));
        });
      return;
    }

    if (parsed.actionName === 'confirm_reimburse' || parsed.actionName === 'upload_complete') {
      void this.prepareRecognition(body)
        .then((result) => {
          res.status(200).json(
            buildCardActionResponse(parsed.actionName, result?.card, {
              rejected: result?.rejected,
              syncPending: result?.syncPending,
            }),
          );
          if (result?.sessionId) {
            setImmediate(() => {
              void this.executeRecognition(result.sessionId!).catch((err) => {
                this.logger.error('执行识别失败', err);
              });
            });
          }
        })
        .catch((err) => {
          this.logger.error('准备识别失败', err);
          res.status(200).json(buildCardActionResponse(parsed.actionName));
        });
      return;
    }

    res.status(200).json(buildCardActionResponse(parsed.actionName));

    if (!this.feishuApi.isEnabled()) return;

    setImmediate(() => {
      void this.handleCardAction(body).catch((err) => {
        this.logger.error('处理飞书卡片回调失败', err);
      });
    });
  }

  private async processEventBody(body: {
    header?: { event_type?: string };
    event?: {
      message?: {
        message_id?: string;
        chat_id?: string;
        message_type?: string;
        content?: string;
      };
      sender?: { sender_id?: { open_id?: string } };
    };
  }) {
    if (body.header?.event_type !== 'im.message.receive_v1') return;
    const message = body.event?.message;
    const openId = body.event?.sender?.sender_id?.open_id;
    if (!message?.chat_id || !message.message_id || !openId) return;

    await this.processIncomingMessage({
      message_id: message.message_id,
      chat_id: message.chat_id,
      message_type: message.message_type,
      content: message.content,
      open_id: openId,
    });
  }

  private async processIncomingMessage(message: {
    message_id: string;
    chat_id: string;
    message_type?: string;
    content?: string;
    open_id: string;
  }) {
    const likelyFile = isLikelyFileMessage(message);
    const chatKey = this.chatLockKey(message.open_id, message.chat_id);

    const [alreadyHandled, existingUpload, existingSubmit] =
      await Promise.all([
        this.sessionModel.findOne({
          $or: [
            { trigger_message_id: message.message_id },
            { trigger_message_ids: message.message_id },
          ],
        }),
        this.findAwaitingUploadSession(message.open_id, message.chat_id),
        this.findAwaitingSubmitSession(message.open_id, message.chat_id),
      ]);

    if (alreadyHandled) {
      this.logger.log(`忽略重复飞书消息事件 message_id=${message.message_id}`);
      return;
    }

    if (likelyFile && (await this.shouldRejectFilesDuringRecognition(
      message.open_id,
      message.chat_id,
    ))) {
      this.logger.log(
        `识别中，拒绝新文件 chat=${message.chat_id}`,
      );
      if (this.feishuApi.isEnabled()) {
        void this.feishuApi
          .sendTextMessage(
            message.chat_id,
            '正在识别发票，请等待完成后再发送文件。',
          )
          .catch((err) => {
            this.logger.warn(
              `发送识别中提示失败 chat=${message.chat_id}`,
              err,
            );
          });
      }
      return;
    }

    let receiveMarked = false;

    if (likelyFile) {
      this.beginChatFileReceive(chatKey);
      receiveMarked = true;
      const cached = this.uploadConfirmCache.get(chatKey);
      if (cached) {
        this.markUploadSyncPending(cached.sessionId);
      }
    }

    try {
      if (likelyFile && existingUpload?.message_ids?.confirm) {
        this.markUploadSyncPending(existingUpload.session_id);
        this.ensureUploadConfirmCache(existingUpload);
      }

      const parsed = await this.resolveIncomingFiles({
        message_id: message.message_id,
        message_type: message.message_type,
        content: message.content,
      });
      if (parsed.sourceFiles.length === 0 && parsed.skipped.length === 0) {
        if (existingUpload?.message_ids?.confirm) {
          await this.releaseUploadConfirmSyncIfIdle(
            message.open_id,
            message.chat_id,
          );
        }
        return;
      }

      const incomingPayload: IncomingFilePayload = {
        openId: message.open_id,
        chatId: message.chat_id,
        messageIds: [message.message_id],
        sourceFiles: parsed.sourceFiles,
        skipped: parsed.skipped,
      };

      if (this.hasActiveFileSession(existingUpload, existingSubmit)) {
        await this.processImmediateIncoming(incomingPayload, existingSubmit);
        return;
      }

      const isNewBatch = this.messageBatch.enqueue(
        message.open_id,
        message.chat_id,
        message.message_id,
        parsed,
        (payload) => this.handleBatchedIncoming(payload),
      );

      if (isNewBatch && this.feishuApi.isEnabled()) {
        void this.feishuApi
          .sendTextMessage(message.chat_id, '已收到文件，正在整理清单…')
          .catch((err) => {
            this.logger.warn(
              `发送整理提示失败 chat=${message.chat_id}`,
              err,
            );
          });
      }
    } finally {
      if (receiveMarked) {
        this.endChatFileReceive(chatKey);
      }
    }
  }

  /** 已有上传/结果会话：跳过后续批量窗口，立即合并（不含识别中） */
  private hasActiveFileSession(
    existingUpload: BotSession | null,
    existingSubmit: BotSession | null,
  ): boolean {
    if (existingUpload) return true;
    if (!existingSubmit) return false;
    return this.isSupplementUploadSession(existingSubmit);
  }

  private async processImmediateIncoming(
    payload: IncomingFilePayload,
    existingSubmit: BotSession | null,
  ): Promise<void> {
    try {
      if (this.messageBatch.hasPending(payload.openId, payload.chatId)) {
        await this.messageBatch.flushNow(payload.openId, payload.chatId);
      }
      await this.handleBatchedIncoming(payload);

      if (
        this.feishuApi.isEnabled() &&
        existingSubmit &&
        this.isSupplementUploadSession(existingSubmit)
      ) {
        await this.feishuApi.sendTextMessage(
          payload.chatId,
          '已收到补传文件，正在识别新增部分…',
        );
      }
    } finally {
      await this.releaseUploadConfirmSyncIfIdle(payload.openId, payload.chatId);
    }
  }

  private isUploadConfirmStillWaiting(
    openId: string,
    chatId: string,
    sessionId: string,
  ): boolean {
    return (
      this.messageBatch.hasPending(openId, chatId) ||
      this.uploadCardRefreshTimers.has(sessionId)
    );
  }

  private async releaseUploadConfirmSyncIfIdle(
    openId: string,
    chatId: string,
  ): Promise<void> {
    const session = await this.findAwaitingUploadSession(openId, chatId);
    if (!session?.message_ids?.confirm) return;
    if (this.isUploadConfirmStillWaiting(openId, chatId, session.session_id)) {
      return;
    }
    this.clearUploadSyncPending(session.session_id);
    await this.publishUploadConfirmCardById(session.session_id);
  }

  private chatLockKey(openId: string, chatId: string): string {
    return `${openId}:${chatId}`;
  }

  /** 同一对话内串行处理会话合并，避免并发创建多个上传 session */
  private async withChatLock<T>(
    openId: string,
    chatId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const key = this.chatLockKey(openId, chatId);
    const prev = this.chatLockTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prev.then(() => gate);
    this.chatLockTails.set(key, tail);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.chatLockTails.get(key) === tail) {
        this.chatLockTails.delete(key);
      }
    }
  }

  private async handleBatchedIncoming(batch: IncomingFilePayload): Promise<void> {
    if (batch.sourceFiles.length === 0 && batch.skipped.length === 0) return;

    if (await this.shouldRejectFilesDuringRecognition(batch.openId, batch.chatId)) {
      this.logger.log(`识别中，忽略批量文件 chat=${batch.chatId}`);
      if (this.feishuApi.isEnabled()) {
        void this.feishuApi
          .sendTextMessage(
            batch.chatId,
            '正在识别发票，请等待完成后再发送文件。',
          )
          .catch((err) => {
            this.logger.warn(`发送识别中提示失败 chat=${batch.chatId}`, err);
          });
      }
      return;
    }

    await this.withChatLock(batch.openId, batch.chatId, async () => {
      const existingUpload = await this.findAwaitingUploadSession(
        batch.openId,
        batch.chatId,
      );
      if (existingUpload) {
        await this.mergeIntoUploadSession(existingUpload, batch);
        return;
      }

      const existingSubmit = await this.findAwaitingSubmitSession(
        batch.openId,
        batch.chatId,
      );
      if (existingSubmit && this.isSupplementUploadSession(existingSubmit)) {
        await this.mergeIntoAwaitingSubmitSession(existingSubmit, batch);
        return;
      }

      await this.createUploadSessionFromIncoming(batch);
    });
  }

  private async createUploadSessionFromIncoming(batch: IncomingFilePayload) {
    const folderSkips = batch.sourceFiles
      .filter((f) => f.kind === 'folder')
      .map((f) => folderSkipMessage(f.file_name));

    const existingUpload = await this.findAwaitingUploadSession(
      batch.openId,
      batch.chatId,
    );
    if (existingUpload) {
      await this.mergeIntoUploadSession(existingUpload, batch);
      return;
    }

    await this.cancelSupersededSessions(batch.openId, batch.chatId);

    const sessionId = randomUUID();
    await this.sessionModel.create({
      session_id: sessionId,
      open_id: batch.openId,
      chat_id: batch.chatId,
      trigger_message_id: batch.messageIds[0],
      trigger_message_ids: batch.messageIds,
      status: 'awaiting_upload',
      source_files: batch.sourceFiles,
      skipped_names: [...batch.skipped, ...folderSkips],
      recognized_items: [],
      expires_at: new Date(Date.now() + SESSION_TTL_MS),
    });

    this.scheduleUploadCardPublish(sessionId);
  }

  private async resolveIncomingFiles(message: {
    message_id: string;
    message_type?: string;
    content?: string;
  }): Promise<{ sourceFiles: ParsedSourceFile[]; skipped: string[] }> {
    let parsed: { sourceFiles: ParsedSourceFile[]; skipped: string[] } =
      parseFeishuMessageFiles(message);

    const needsFetch = parsed.sourceFiles.some((f) =>
      isSyntheticFileName(f.file_name),
    );
    if (needsFetch) {
      try {
        const eventContent = message.content
          ? (JSON.parse(message.content) as Record<string, unknown>)
          : {};
        const fetched = await this.feishuApi.getMessageContent(
          message.message_id,
        );
        const merged = mergeMessageContent(eventContent, fetched);
        parsed = parseFeishuMessageFiles({
          ...message,
          content: JSON.stringify(merged),
        });
      } catch (err) {
        this.logger.warn(
          `拉取飞书消息 ${message.message_id} 详情失败，使用事件内文件名`,
          err,
        );
      }
    }

    return parsed;
  }

  private async processCardAction(body: Record<string, unknown>) {
    const parsed = parseCardActionBody(body);
    const { actionName, sessionId, openId } = parsed;
    if (!openId || !actionName) {
      this.logger.warn('忽略卡片回调：缺少 openId 或 action');
      return;
    }

    this.logger.log(
      `处理卡片动作 action=${actionName} session=${sessionId ?? '-'} openId=${openId}`,
    );

    if (actionName === 'dismiss') return;

    if (!sessionId) return;
    const session = await this.sessionModel.findOne({ session_id: sessionId });
    if (!session || session.open_id !== openId) {
      this.logger.warn(
        `忽略卡片回调：会话不存在或 openId 不匹配 session=${sessionId}`,
      );
      return;
    }

    if (session.status === 'submitted') {
      this.logger.warn(`忽略卡片动作 ${actionName}：已提交 session=${sessionId}`);
      return;
    }

    if (session.status === 'cancelled' || session.status === 'expired') {
      this.logger.warn(
        `忽略卡片动作 ${actionName}：会话状态为 ${session.status}`,
      );
      return;
    }

    if (
      RECOGNITION_START_ACTIONS.has(actionName ?? '') &&
      !isUploadSessionStatus(session.status)
    ) {
      this.logger.warn(
        `忽略识别开始：会话状态为 ${session.status} session=${sessionId}`,
      );
      return;
    }

    if (
      (actionName === 'submit_all_matched' ||
        actionName === 'submit_skip_duplicates' ||
        actionName === 'submit_with_selection') &&
      session.status !== 'awaiting_submit'
    ) {
      this.logger.warn(
        `忽略 submit：会话状态为 ${session.status} session=${sessionId}`,
      );
      return;
    }

    if (actionName === 'save_profile' && session.status !== 'awaiting_profile') {
      this.logger.warn(
        `忽略 save_profile：会话状态为 ${session.status} session=${sessionId}`,
      );
      return;
    }

    switch (actionName) {
      case 'cancel_reimburse':
      case 'cancel_submit':
        await this.handleCancelSession(body);
        return;
      case 'confirm_reimburse':
      case 'upload_complete':
        await this.runRecognition(session);
        return;
      case 'save_profile': {
        const event = (body.event as Record<string, unknown>) ?? body;
        const action = (event.action ?? body.action) as {
          form_value?: Record<string, string>;
        };
        await this.saveProfile(session, action?.form_value ?? {});
        return;
      }
      case 'submit_all_matched':
        await this.submitMatched(session, false);
        return;
      case 'submit_skip_duplicates':
        await this.submitMatched(session, true);
        return;
      case 'submit_with_selection': {
        const event = (body.event as Record<string, unknown>) ?? body;
        const action = (event.action ?? body.action) as {
          form_value?: Record<string, string>;
        };
        await this.submitWithSelection(
          session,
          action?.form_value ?? {},
          session.recognized_items.some((i) => i.duplicate),
        );
        return;
      }
      default:
        return;
    }
  }

  private async refreshProgressCard(
    session: BotSession,
    done: number,
    total: number,
    hint?: string,
  ) {
    const progressId = session.message_ids?.progress;
    if (!progressId) return;
    const card = buildProgressCard(session.session_id, done, total, hint);
    try {
      await this.feishuApi.updateInteractiveCard(progressId, card);
    } catch (err) {
      this.logger.warn(`更新进度卡片失败 session=${session.session_id}`, err);
    }
  }

  private estimateRecognizableCount(sourceFiles: BotSourceFile[]): number {
    return sourceFiles.filter(
      (f) => isRecognizableKind(f.kind) || isExtractableContainer(f.kind),
    ).length;
  }

  private async extractContainerFiles(
    source: BotSourceFile,
    skipped: string[],
  ): Promise<DownloadedFile[]> {
    if (source.kind === 'folder') {
      skipped.push(folderSkipMessage(source.file_name));
      return [];
    }

    let buffer: Buffer;
    try {
      buffer = await this.feishuApi.downloadMessageResource(
        source.message_id ?? '',
        source.file_key,
        this.resolveResourceDownloadType(source),
      );
    } catch (err) {
      this.logger.warn(`下载压缩包失败 ${source.file_name}`, err);
      skipped.push(`${source.file_name}: 下载失败`);
      return [];
    }

    const extracted = extractRecognizableFromZip(buffer, this.getZipExtractOptions());
    if (!extracted.ok) {
      skipped.push(`${source.file_name}: ${extracted.reason}`);
      skipped.push(...extracted.skipped);
      return [];
    }

    skipped.push(...extracted.skipped);
    return extracted.entries.map((entry) => ({
      file_name: entry.file_name,
      buffer: entry.buffer,
      mime: entry.file_name.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : 'image/jpeg',
      file_key: source.file_key,
    }));
  }

  private resolveCardSource(
    session: BotSession,
  ): 'awaiting_confirm' | 'awaiting_submit' | 'awaiting_profile' {
    if (session.status === 'awaiting_submit') return 'awaiting_submit';
    if (session.status === 'awaiting_profile') return 'awaiting_profile';
    return 'awaiting_confirm';
  }

  private findAwaitingUploadSession(openId: string, chatId: string) {
    return this.sessionModel
      .findOne({
        open_id: openId,
        chat_id: chatId,
        status: { $in: UPLOAD_SESSION_STATUSES },
      })
      .sort({ updatedAt: -1 });
  }

  /** 已有识别结果卡后的补传（非首轮上传/首次识别） */
  private isSupplementUploadSession(session: BotSession): boolean {
    return Boolean(session.message_ids?.result);
  }

  private findAwaitingSubmitSession(openId: string, chatId: string) {
    return this.sessionModel
      .findOne({
        open_id: openId,
        chat_id: chatId,
        status: 'awaiting_submit',
      })
      .sort({ updatedAt: -1 });
  }

  private findRecognizingSession(openId: string, chatId: string) {
    return this.sessionModel
      .findOne({
        open_id: openId,
        chat_id: chatId,
        status: 'recognizing',
      })
      .sort({ updatedAt: -1 });
  }

  private markRecognitionAborted(sessionId: string): void {
    this.abortedRecognitionSessions.add(sessionId);
  }

  private clearRecognitionAborted(sessionId: string): void {
    this.abortedRecognitionSessions.delete(sessionId);
  }

  private isRecognitionAborted(
    sessionId: string,
    status?: BotSessionStatus,
  ): boolean {
    if (this.abortedRecognitionSessions.has(sessionId)) return true;
    return status === 'cancelled' || status === 'expired';
  }

  private async cancelAllRecognizingInChat(
    openId: string,
    chatId: string,
  ): Promise<void> {
    const recognizingSessions = await this.sessionModel
      .find({ open_id: openId, chat_id: chatId, status: 'recognizing' })
      .select('session_id')
      .lean();
    for (const row of recognizingSessions) {
      this.markRecognitionAborted(row.session_id);
      this.incrementalRecognitionTails.delete(row.session_id);
    }
    await this.sessionModel.updateMany(
      { open_id: openId, chat_id: chatId, status: 'recognizing' },
      { $set: { status: 'cancelled' } },
    );
  }

  /** 识别进行中是否应拒绝新文件；若用户已结束上一轮则清理遗留 recognizing */
  private async shouldRejectFilesDuringRecognition(
    openId: string,
    chatId: string,
  ): Promise<boolean> {
    const recognizing = await this.findRecognizingSession(openId, chatId);
    if (!recognizing) return false;

    const latest = await this.sessionModel
      .findOne({ open_id: openId, chat_id: chatId })
      .sort({ updatedAt: -1 })
      .select('status session_id')
      .lean();

    if (
      latest &&
      (latest.status === 'cancelled' || latest.status === 'submitted')
    ) {
      this.logger.warn(
        `上一轮已${latest.status === 'submitted' ? '提交' : '取消'}，清理遗留 recognizing chat=${chatId}`,
      );
      await this.cancelAllRecognizingInChat(openId, chatId);
      return false;
    }

    if (this.isRecognitionAborted(recognizing.session_id, recognizing.status)) {
      await this.cancelAllRecognizingInChat(openId, chatId);
      return false;
    }

    return true;
  }

  private async loadActiveRecognizingSession(
    sessionId: string,
  ): Promise<BotSession | null> {
    const session = await this.sessionModel.findOne({ session_id: sessionId });
    if (!session || session.status !== 'recognizing') return null;
    if (this.isRecognitionAborted(sessionId, session.status)) return null;
    return session;
  }

  private async mergeIntoUploadSession(
    session: BotSession,
    batch: IncomingFilePayload,
  ): Promise<void> {
    if (!isUploadSessionStatus(session.status)) {
      this.logger.warn(
        `忽略合并：会话状态为 ${session.status} session=${session.session_id}`,
      );
      return;
    }

    const folderSkips = batch.sourceFiles
      .filter((f) => f.kind === 'folder')
      .map((f) => folderSkipMessage(f.file_name));

    const updated = await this.sessionModel.findOneAndUpdate(
      {
        session_id: session.session_id,
        status: { $in: UPLOAD_SESSION_STATUSES },
      },
      {
        $set: {
          source_files: mergeSourceFiles(
            session.source_files,
            batch.sourceFiles,
          ),
          trigger_message_ids: mergeUniqueStrings(
            session.trigger_message_ids ?? [],
            batch.messageIds,
          ),
          trigger_message_id:
            session.trigger_message_id ?? batch.messageIds[0],
          skipped_names: mergeUniqueStrings(session.skipped_names, [
            ...batch.skipped,
            ...folderSkips,
          ]),
          expires_at: new Date(Date.now() + SESSION_TTL_MS),
          status: 'awaiting_upload',
        },
      },
      { new: true },
    );
    if (!updated) {
      this.logger.warn(
        `忽略合并：会话已不可上传 session=${session.session_id}`,
      );
      return;
    }

    await this.flushUploadCardPublish(updated.session_id);
  }

  private async mergeIntoAwaitingSubmitSession(
    session: BotSession,
    batch: IncomingFilePayload,
  ): Promise<void> {
    const folderSkips = batch.sourceFiles
      .filter((f) => f.kind === 'folder')
      .map((f) => folderSkipMessage(f.file_name));

    const mergedFiles = mergeSourceFiles(session.source_files, batch.sourceFiles);
    const pendingBefore = listPendingSourceFiles(
      mergedFiles,
      session.recognized_items,
    );
    if (pendingBefore.length === 0) {
      this.logger.log(
        `补传无新增可识别文件 session=${session.session_id}`,
      );
      return;
    }

    const updated = await this.sessionModel.findOneAndUpdate(
      {
        session_id: session.session_id,
        status: 'awaiting_submit',
      },
      {
        $set: {
          source_files: mergedFiles,
          trigger_message_ids: mergeUniqueStrings(
            session.trigger_message_ids ?? [],
            batch.messageIds,
          ),
          trigger_message_id:
            session.trigger_message_id ?? batch.messageIds[0],
          skipped_names: mergeUniqueStrings(session.skipped_names, [
            ...batch.skipped,
            ...folderSkips,
          ]),
          expires_at: new Date(Date.now() + SESSION_TTL_MS),
        },
      },
      { new: true },
    );
    if (!updated) {
      this.logger.warn(
        `忽略补传合并：会话已不可追加 session=${session.session_id}`,
      );
      return;
    }

    this.logger.log(
      `补传已合并 session=${updated.session_id} pending=${pendingBefore.length}`,
    );

    void this.lockResultCard(updated.session_id).catch((err) => {
      this.logger.warn(
        `锁定结果卡失败 session=${updated.session_id}`,
        err,
      );
    });
    this.enqueueIncrementalRecognition(updated.session_id);
  }

  private enqueueIncrementalRecognition(sessionId: string): void {
    const prev =
      this.incrementalRecognitionTails.get(sessionId) ?? Promise.resolve();
    const tail = prev
      .then(() => this.runIncrementalRecognition(sessionId))
      .catch((err) => {
        this.logger.error(`增量识别失败 session=${sessionId}`, err);
      });
    this.incrementalRecognitionTails.set(sessionId, tail);
    void tail.finally(() => {
      if (this.incrementalRecognitionTails.get(sessionId) === tail) {
        this.incrementalRecognitionTails.delete(sessionId);
      }
    });
  }

  private clearUploadCardPublish(sessionId: string): void {
    const pending = this.uploadCardRefreshTimers.get(sessionId);
    if (pending) clearTimeout(pending);
    this.uploadCardRefreshTimers.delete(sessionId);
  }

  /** 立即刷新确认卡（跳过防抖） */
  private flushUploadCardPublish(sessionId: string): Promise<void> {
    const pending = this.uploadCardRefreshTimers.get(sessionId);
    if (pending) {
      clearTimeout(pending);
      this.uploadCardRefreshTimers.delete(sessionId);
    }
    return this.publishUploadConfirmCardById(sessionId);
  }

  /** 识别开始前：合并批量队列中的文件并刷新确认卡 */
  private async drainPendingUploads(session: BotSession): Promise<BotSession> {
    await this.messageBatch.flushNow(session.open_id, session.chat_id);
    await this.flushUploadCardPublish(session.session_id);
    const fresh = await this.sessionModel.findOne({
      session_id: session.session_id,
    });
    if (fresh) {
      this.logger.log(
        `识别前已同步待处理文件 session=${fresh.session_id} files=${fresh.source_files.length}`,
      );
      return fresh;
    }
    return session;
  }

  private scheduleUploadCardPublish(sessionId: string): void {
    const pending = this.uploadCardRefreshTimers.get(sessionId);
    if (pending) clearTimeout(pending);
    if (UPLOAD_CARD_DEBOUNCE_MS <= 0) {
      this.uploadCardRefreshTimers.delete(sessionId);
      void this.publishUploadConfirmCardById(sessionId).catch((err) => {
        this.logger.error(`刷新上传确认卡失败 session=${sessionId}`, err);
      });
      return;
    }
    this.uploadCardRefreshTimers.set(
      sessionId,
      setTimeout(() => {
        this.uploadCardRefreshTimers.delete(sessionId);
        void this.publishUploadConfirmCardById(sessionId).catch((err) => {
          this.logger.error(`刷新上传确认卡失败 session=${sessionId}`, err);
        });
      }, UPLOAD_CARD_DEBOUNCE_MS),
    );
  }

  private async publishUploadConfirmCardById(sessionId: string): Promise<void> {
    return this.uploadCardPublishLock.run(sessionId, async () => {
      const session = await this.sessionModel.findOne({ session_id: sessionId });
      if (!session || !isUploadSessionStatus(session.status)) return;

      const stillWaiting = this.isUploadConfirmStillWaiting(
        session.open_id,
        session.chat_id,
        sessionId,
      );
      if (!stillWaiting) {
        this.clearUploadSyncPending(sessionId);
      }

      const card = buildConfirmCard(
        session.session_id,
        this.buildUploadCardStats(session),
        session.source_files.map((f) => ({ name: f.file_name, kind: f.kind })),
      );
      try {
        await this.publishUploadConfirmCard(session, card);
        const fresh = await this.sessionModel.findOne({ session_id: sessionId });
        if (fresh?.message_ids?.confirm) {
          this.registerUploadConfirmCache(fresh, fresh.message_ids.confirm);
        }
      } catch (err) {
        this.logger.error(`发送上传确认卡失败 session=${sessionId}`, err);
        const deleted = await this.sessionModel.findOneAndDelete({
          session_id: sessionId,
          status: { $in: UPLOAD_SESSION_STATUSES },
          'message_ids.confirm': { $exists: false },
        });
        if (deleted) {
          await this.feishuApi.sendTextMessage(
            session.chat_id,
            '收到文件，但卡片发送失败。请稍后重试，或联系管理员查看服务端日志。',
          );
        }
      }
    });
  }

  private buildUploadCardStats(session: BotSession) {
    const sourceFiles = session.source_files;
    const recognizable = sourceFiles.filter((f) =>
      isRecognizableKind(f.kind),
    ).length;
    const zipCount = sourceFiles.filter((f) => f.kind === 'zip').length;
    const folderCount = sourceFiles.filter((f) => f.kind === 'folder').length;
    return {
      recognizable: recognizable + zipCount,
      zipCount,
      folderCount,
      skipCount: session.skipped_names.length,
    };
  }

  /** 15 分钟内原地更新确认卡，否则发新卡（用户可见新消息） */
  private async publishUploadConfirmCard(
    session: BotSession,
    card: ReturnType<typeof buildConfirmCard>,
  ): Promise<void> {
    const fresh = await this.sessionModel.findOne({
      session_id: session.session_id,
    });
    if (!fresh || !isUploadSessionStatus(fresh.status)) {
      this.logger.warn(
        `跳过上传确认卡：会话状态为 ${fresh?.status ?? 'missing'} session=${session.session_id}`,
      );
      return;
    }

    const confirmId = fresh.message_ids?.confirm;
    const sentAt = fresh.message_ids?.confirm_sent_at;
    const withinUpdateWindow =
      !!confirmId &&
      !!sentAt &&
      Date.now() - new Date(sentAt).getTime() < UPLOAD_CARD_UPDATE_WINDOW_MS;

    if (withinUpdateWindow && confirmId) {
      try {
        await this.feishuApi.updateInteractiveCard(confirmId, {
          card: card.card,
        });
        this.registerUploadConfirmCache(fresh, confirmId);
        this.logger.log(
          `已更新上传确认卡 session=${fresh.session_id} message=${confirmId} files=${fresh.source_files.length}`,
        );
        return;
      } catch (err) {
        this.logger.warn(
          `更新上传确认卡失败，改发新卡 session=${fresh.session_id} message=${confirmId}`,
          err,
        );
      }
    }

    const messageId = await this.feishuApi.sendInteractiveCard(
      fresh.chat_id,
      card,
    );
    const saved = await this.sessionModel.findOneAndUpdate(
      {
        session_id: fresh.session_id,
        status: { $in: UPLOAD_SESSION_STATUSES },
      },
      {
        $set: {
          'message_ids.confirm': messageId,
          'message_ids.confirm_sent_at': new Date(),
        },
      },
      { new: true },
    );
    if (!saved) {
      this.logger.warn(
        `会话已结束，跳过写入 confirm 卡片 session=${fresh.session_id}`,
      );
      return;
    }
    this.registerUploadConfirmCache(saved, messageId);
    this.logger.log(
      `已发送上传确认卡 session=${saved.session_id} message=${messageId} files=${saved.source_files.length}`,
    );
  }

  private async cancelSupersededSessions(
    openId: string,
    chatId: string,
  ): Promise<void> {
    const activeStatuses: BotSessionStatus[] = [
      'recognizing',
      'awaiting_submit',
      'awaiting_profile',
    ];
    const staleSessions = await this.sessionModel.find({
      open_id: openId,
      chat_id: chatId,
      status: { $in: activeStatuses },
    });

    for (const session of staleSessions) {
      const cardSource = this.resolveCardSource(session);
      session.status = 'cancelled';
      await session.save();
      const payload = await this.buildCancelledCardPayload(session, cardSource);
      if (payload?.messageId) {
        try {
          await this.feishuApi.updateInteractiveCard(payload.messageId, {
            card: payload.card,
          });
        } catch (err) {
          this.logger.warn(
            `作废旧会话卡片失败 session=${session.session_id}`,
            err,
          );
        }
      }
    }
  }

  /** 同步将确认卡置为「识别中」，供卡片回调即时响应 */
  async prepareRecognition(
    body: Record<string, unknown>,
  ): Promise<{
    card?: unknown;
    sessionId?: string;
    rejected?: boolean;
    syncPending?: boolean;
  } | null> {
    const parsed = parseCardActionBody(body);
    const { sessionId, openId } = parsed;
    if (!openId || !sessionId) return null;

    const session = await this.sessionModel.findOne({ session_id: sessionId });
    if (!session || session.open_id !== openId) return null;

    if (session.status === 'cancelled' || session.status === 'expired') {
      this.logger.warn(
        `拒绝识别：会话状态为 ${session.status} session=${sessionId}`,
      );
      return {
        rejected: true,
        card: this.buildConfirmCardForSession(session, { cancelled: true }),
      };
    }

    if (!isUploadSessionStatus(session.status)) {
      this.logger.warn(
        `拒绝识别：会话状态为 ${session.status} session=${sessionId}`,
      );
      return { rejected: true };
    }

    if (this.shouldBlockUploadComplete(session)) {
      this.logger.warn(
        `拒绝识别：清单仍在同步 session=${sessionId}`,
      );
      return { syncPending: true };
    }

    session.status = 'recognizing';
    await session.save();

    return {
      card: this.buildConfirmCardForSession(session, { processing: true }),
      sessionId: session.session_id,
    };
  }

  async executeRecognition(sessionId: string): Promise<void> {
    const initial = await this.loadActiveRecognizingSession(sessionId);
    if (!initial) {
      this.logger.warn(`忽略识别：会话不在 recognizing 或已中止 session=${sessionId}`);
      return;
    }
    let session: BotSession = initial;

    await this.messageBatch.flushNow(session.open_id, session.chat_id);
    const afterFlush = await this.loadActiveRecognizingSession(sessionId);
    if (!afterFlush) {
      this.logger.warn(`忽略识别：合并后会话已中止 session=${sessionId}`);
      return;
    }
    session = afterFlush;

    if (this.shouldBlockUploadComplete(session)) {
      session.status = 'awaiting_upload';
      await session.save();
      if (session.message_ids?.confirm) {
        await this.updateSessionCard(
          session,
          session.message_ids.confirm,
          this.buildConfirmCardForSession(session),
        );
      }
      this.clearRecognitionAborted(sessionId);
      return;
    }

    const estimatedTotal = Math.max(
      1,
      this.estimateRecognizableCount(session.source_files),
    );
    const progressCard = buildProgressCard(
      session.session_id,
      0,
      estimatedTotal,
      '正在下载文件…',
    );
    const progressId = await this.feishuApi.sendInteractiveCard(
      session.chat_id,
      progressCard,
    );
    session.message_ids = { ...session.message_ids, progress: progressId };
    await session.save();

    try {
      const activeSession = await this.loadActiveRecognizingSession(sessionId);
      if (!activeSession) {
        this.logger.warn(`识别已中止，停止执行 session=${sessionId}`);
        return;
      }
      session = activeSession;

      const user = await this.identity.resolveUser(session.open_id);
      session.user_id = String(user._id);
      await session.save();

      if (!(await this.loadActiveRecognizingSession(sessionId))) {
        this.logger.warn(`识别已中止（解析用户后）session=${sessionId}`);
        return;
      }

      const downloaded = await this.collectRecognizableFiles(session);
      const skipped = [...session.skipped_names];
      if (downloaded.skipped.length) {
        skipped.push(...downloaded.skipped);
      }

      if (downloaded.files.length === 0) {
        const card = buildNoRecognizableCard(skipped);
        await this.feishuApi.sendInteractiveCard(session.chat_id, card);
        session.status = 'cancelled';
        session.skipped_names = skipped;
        await session.save();
        return;
      }

      if (
        this.maxRecognizableFiles > 0 &&
        downloaded.files.length > this.maxRecognizableFiles
      ) {
        const card = buildNoRecognizableCard([
          ...skipped,
          `超过单次 ${this.maxRecognizableFiles} 个可识别文件限制`,
        ]);
        await this.feishuApi.sendInteractiveCard(session.chat_id, card);
        session.status = 'cancelled';
        await session.save();
        return;
      }

      const total = downloaded.files.length;
      await this.refreshProgressCard(
        session,
        0,
        total,
        '文件已就绪，正在 AI 识别…',
      );

      const existingInvoiceNumbers = new Set<string>();
      const recognized = await this.recognizeDownloadedBatch(
        session,
        String(user._id),
        downloaded.files,
        skipped,
        {
          existingInvoiceNumbers,
          onProgress: async (done, progressTotal) => {
            await this.refreshProgressCard(session, done, progressTotal);
          },
        },
      );

      const recognizedWithAmounts = enrichRecognizedAmounts(recognized);

      if (recognizedWithAmounts.length === 0) {
        if (!(await this.loadActiveRecognizingSession(sessionId))) return;
        const card = buildNoRecognizableCard(skipped);
        await this.feishuApi.sendInteractiveCard(session.chat_id, card);
        session.status = 'cancelled';
        session.skipped_names = skipped;
        await session.save();
        this.clearRecognitionAborted(sessionId);
        return;
      }

      if (!(await this.loadActiveRecognizingSession(sessionId))) {
        this.logger.warn(`识别已中止（AI 完成后）session=${sessionId}`);
        return;
      }

      await this.refreshProgressCard(
        session,
        total,
        total,
        '识别完成，正在生成结果…',
      );

      session.recognized_items = recognizedWithAmounts;
      session.skipped_names = skipped;
      session.status = 'awaiting_submit';
      await session.save();

      const mode = this.resolveResultMode(recognizedWithAmounts);
      const typeOptions = await this.fetchTypeOptions(String(user._id));
      const card = buildResultCard(
        session.session_id,
        this.mapRecognizedToCardItems(recognizedWithAmounts),
        skipped,
        mode,
        { typeOptions },
      );
      const resultId = await this.feishuApi.sendInteractiveCard(
        session.chat_id,
        card,
      );
      session.message_ids = { ...session.message_ids, result: resultId };
      await session.save();
      this.clearRecognitionAborted(sessionId);
      await this.finalizeResultCardAfterIncremental(session.session_id);
    } catch (err) {
      this.logger.error('识别失败', err);
      if (this.isRecognitionAborted(sessionId)) return;
      const card = buildNoRecognizableCard([
        ...session.skipped_names,
        '识别失败，请稍后重试',
      ]);
      await this.feishuApi.sendInteractiveCard(session.chat_id, card);
      session.status = 'cancelled';
      await session.save();
    }
  }

  private async runRecognition(session: BotSession) {
    let active = session;
    if (isUploadSessionStatus(active.status)) {
      active = await this.drainPendingUploads(active);
      if (this.shouldBlockUploadComplete(active)) {
        return;
      }
      active.status = 'recognizing';
      await active.save();
      await this.updateSessionCard(
        active,
        active.message_ids?.confirm,
        this.buildConfirmCardForSession(active, { processing: true }),
      );
    } else if (active.status !== 'recognizing') {
      this.logger.warn(
        `忽略识别：会话状态为 ${active.status} session=${active.session_id}`,
      );
      return;
    }
    await this.executeRecognition(active.session_id);
  }

  private async buildProfileCardForSession(
    session: BotSession,
    options?: { cancelled?: boolean; saved?: boolean },
  ) {
    const companies = await this.companyService.findNameOptions();
    const gaps = ['报销公司', '收款账户'];
    return buildProfileCardContent(
      session.session_id,
      gaps,
      companies.map((c) => ({ id: String(c._id), name: c.name })),
      options,
    );
  }

  private resolveResourceDownloadType(
    source: BotSourceFile,
  ): 'file' | 'image' {
    return source.resource_type ?? 'file';
  }

  private async downloadSourceFile(
    source: BotSourceFile,
    skipped: string[],
  ): Promise<DownloadedFile | null> {
    const messageId = source.message_id ?? '';
    if (!messageId) {
      skipped.push(`${source.file_name}: 缺少消息 ID`);
      return null;
    }

    let fileKey = source.file_key;
    let resourceType = this.resolveResourceDownloadType(source);

    try {
      const content = await this.feishuApi.getMessageContent(messageId);
      if (content.image_key) {
        fileKey = String(content.image_key);
        resourceType = 'image';
      } else if (content.file_key) {
        fileKey = String(content.file_key);
        resourceType = 'file';
      }
    } catch (err) {
      this.logger.warn(`拉取消息资源 key 失败 message=${messageId}`, err);
    }

    try {
      const buffer = await this.feishuApi.downloadMessageResource(
        messageId,
        fileKey,
        resourceType,
      );
      if (buffer.length > this.maxFileBytes) {
        skipped.push(`${source.file_name}: 超过单文件大小限制`);
        return null;
      }
      return {
        file_name: source.file_name,
        buffer,
        mime:
          source.kind === 'pdf' ? 'application/pdf' : 'image/jpeg',
        file_key: source.file_key,
      };
    } catch (err) {
      this.logger.warn(
        `下载文件失败 ${source.file_name} message=${messageId} type=${resourceType}`,
        err,
      );
      skipped.push(`${source.file_name}: 下载失败`);
      return null;
    }
  }

  private async collectRecognizableFiles(
    session: BotSession,
    onlySources?: BotSourceFile[],
  ): Promise<{
    files: DownloadedFile[];
    skipped: string[];
  }> {
    const files: DownloadedFile[] = [];
    const skipped: string[] = [];
    const sources = onlySources ?? session.source_files;

    for (const source of sources) {
      if (source.kind === 'folder') {
        skipped.push(folderSkipMessage(source.file_name));
        continue;
      }
      if (isExtractableContainer(source.kind)) {
        const extracted = await this.extractContainerFiles(source, skipped);
        files.push(...extracted);
        continue;
      }

      if (!isRecognizableKind(source.kind)) {
        skipped.push(source.file_name);
        continue;
      }

      const downloaded = await this.downloadSourceFile(source, skipped);
      if (downloaded) {
        files.push(downloaded);
      }
    }

    return { files: deduplicateByFileName(files, skipped), skipped };
  }

  private async recognizeDownloadedBatch(
    session: BotSession,
    userId: string,
    downloadedFiles: DownloadedFile[],
    skipped: string[],
    options: {
      existingInvoiceNumbers: Set<string>;
      onProgress?: (done: number, total: number) => Promise<void>;
    },
  ): Promise<BotRecognizedItem[]> {
    const raw = await this.aiService.extractReimbursementForm(
      downloadedFiles.map(
        (f) => `${f.file_name}::${f.buffer.toString('base64')}`,
      ),
    );
    const groups = this.normalizeExtractGroups(raw);
    const types = await this.typeService.findAll(userId);
    const systemTypes = types.map((t) => ({
      _id: String(t._id),
      label: t.label,
      name: (t as { name?: string }).name,
      code: t.code,
    }));

    const recognized: BotRecognizedItem[] = [];
    const total = downloadedFiles.length;

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const fileMeta = downloadedFiles[i];
      const fileName = fileMeta?.file_name ?? `file-${i + 1}`;

      if (!isRecognizableExtractGroup(group)) {
        skipped.push(formatExtractSkipReason(group, fileName));
        await options.onProgress?.(i + 1, total);
        continue;
      }

      const head = this.pickHeadRow(group);
      const match = matchReimbursementType(
        {
          label: head?.label,
          is_suggested_type: head?.is_suggested_type,
          suggested_type_code: head?.suggested_type_code,
        },
        systemTypes,
      );
      const invoiceNumber = this.resolveInvoiceNumber(group, head);
      let duplicate = group.some((row) => row.invoice_duplicate);
      if (invoiceNumber && !duplicate) {
        if (options.existingInvoiceNumbers.has(invoiceNumber)) {
          duplicate = true;
        } else {
          const check =
            await this.reimbursementService.isInvoiceNumberAvailable(
              invoiceNumber,
            );
          duplicate = !check.available;
        }
      }
      if (invoiceNumber) {
        options.existingInvoiceNumbers.add(invoiceNumber);
      }

      const details = this.buildDetails(head);
      let attachmentId: string | undefined;
      if (fileMeta) {
        const uploaded = await this.fileService.uploadBuffer({
          buffer: fileMeta.buffer,
          originalname: fileMeta.file_name,
          mimetype: fileMeta.mime,
          userId,
          type: 'attachment',
        });
        attachmentId = String(uploaded.id);
      }
      recognized.push({
        file_name: fileMeta?.file_name ?? `file-${i + 1}`,
        category_id: match.matched ? match.category_id : undefined,
        category_label: match.matched
          ? match.category_label
          : String(head?.label ?? '').trim() || '未识别到报销类型',
        matched: match.matched,
        invoice_number: invoiceNumber || undefined,
        invoice_title: head?.invoice_title,
        invoice_date: head?.invoice_date,
        issuer: head?.issuer,
        details,
        amount: this.extractAmount(head),
        duplicate,
        file_key: fileMeta?.file_key,
        attachment_id: attachmentId,
      });
      await options.onProgress?.(i + 1, total);
    }

    return recognized;
  }

  private async runIncrementalRecognition(sessionId: string): Promise<void> {
    const initial = await this.sessionModel.findOne({ session_id: sessionId });
    if (!initial || this.isRecognitionAborted(sessionId, initial.status)) return;

    const pendingSources = listPendingSourceFiles(
      initial.source_files,
      initial.recognized_items,
    );
    if (pendingSources.length === 0) {
      this.clearResultCardSyncPending(sessionId);
      return;
    }

    if (initial.status === 'awaiting_submit') {
      initial.status = 'recognizing';
      await initial.save();
    }

    const activeSession = await this.loadActiveRecognizingSession(sessionId);
    if (!activeSession) return;
    let session: BotSession = activeSession;

    const pending = listPendingSourceFiles(
      session.source_files,
      session.recognized_items,
    );
    if (pending.length === 0) {
      session.status = 'awaiting_submit';
      await session.save();
      this.clearResultCardSyncPending(sessionId);
      await this.sendResultCardForSession(session);
      return;
    }

    try {
      if (!session.user_id) {
        const user = await this.identity.resolveUser(session.open_id);
        session.user_id = String(user._id);
        await session.save();
      }

      const downloaded = await this.collectRecognizableFiles(session, pending);
      const batchSkipped: string[] = [];

      if (downloaded.files.length === 0) {
        session.skipped_names = mergeUniqueStrings(session.skipped_names, [
          ...downloaded.skipped,
        ]);
        session.status = 'awaiting_submit';
        await session.save();
        await this.finalizeResultCardAfterIncremental(sessionId);
        return;
      }

      if (
        this.maxRecognizableFiles > 0 &&
        session.recognized_items.length + downloaded.files.length >
          this.maxRecognizableFiles
      ) {
        session.skipped_names = mergeUniqueStrings(session.skipped_names, [
          ...downloaded.skipped,
          `超过单次 ${this.maxRecognizableFiles} 个可识别文件限制`,
        ]);
        session.status = 'awaiting_submit';
        await session.save();
        this.clearResultCardSyncPending(sessionId);
        await this.sendResultCardForSession(session);
        await this.feishuApi.sendTextMessage(
          session.chat_id,
          `补传文件超过单次 ${this.maxRecognizableFiles} 个限制，请分批提交。`,
        );
        return;
      }

      const existingInvoiceNumbers = new Set(
        session.recognized_items
          .map((item) => item.invoice_number)
          .filter((value): value is string => Boolean(value)),
      );

      const newRecognized = await this.recognizeDownloadedBatch(
        session,
        String(session.user_id),
        downloaded.files,
        batchSkipped,
        { existingInvoiceNumbers },
      );

      const mergedRecognized = enrichRecognizedAmounts([
        ...session.recognized_items,
        ...newRecognized,
      ]);

      session.recognized_items = mergedRecognized;
      session.skipped_names = mergeUniqueStrings(session.skipped_names, [
        ...downloaded.skipped,
        ...batchSkipped,
      ]);
      session.status = 'awaiting_submit';
      await session.save();
      this.clearRecognitionAborted(sessionId);
      await this.finalizeResultCardAfterIncremental(sessionId);
    } catch (err) {
      this.logger.error(`补传识别失败 session=${sessionId}`, err);
      const failed = await this.sessionModel.findOne({ session_id: sessionId });
      if (!failed || this.isRecognitionAborted(sessionId, failed.status)) return;
      failed.status = 'awaiting_submit';
      await failed.save();
      this.clearResultCardSyncPending(sessionId);
      await this.sendResultCardForSession(failed);
      await this.feishuApi.sendTextMessage(
        failed.chat_id,
        '补传文件识别失败，请稍后重试。',
      );
    }
  }

  private async finalizeResultCardAfterIncremental(
    sessionId: string,
  ): Promise<void> {
    const session = await this.sessionModel.findOne({ session_id: sessionId });
    if (!session || session.status === 'cancelled') return;

    const pending = listPendingSourceFiles(
      session.source_files,
      session.recognized_items,
    );
    if (pending.length > 0) {
      this.enqueueIncrementalRecognition(sessionId);
      return;
    }

    this.clearResultCardSyncPending(sessionId);
    await this.sendResultCardForSession(session);
  }

  private async saveProfile(
    session: BotSession,
    formValue: Record<string, string>,
  ) {
    if (session.status !== 'awaiting_profile') {
      this.logger.warn(
        `忽略 save_profile：会话状态为 ${session.status} session=${session.session_id}`,
      );
      return;
    }
    if (!session.user_id) {
      const user = await this.identity.resolveUser(session.open_id);
      session.user_id = String(user._id);
    }
    const companyId = String(formValue.company_id ?? '').trim();
    const paymentAccount = String(formValue.payment_account ?? '').trim();
    if (!companyId || !paymentAccount) {
      return;
    }
    await this.userService.updateProfileSetup(session.user_id, {
      company_id: companyId,
      payment_account: paymentAccount,
    });
    await this.updateSessionCard(
      session,
      session.message_ids?.profile,
      await this.buildProfileCardForSession(session, { saved: true }),
    );
    session.status = 'awaiting_submit';
    await session.save();
    await this.sendResultCardForSession(session);
  }

  private async submitWithSelection(
    session: BotSession,
    formValue: Record<string, string>,
    skipDuplicates: boolean,
  ) {
    if (session.status !== 'awaiting_submit') return;

    const updated = session.recognized_items.map((item, index) => {
      if (item.matched || item.duplicate) return item;
      const selected = String(formValue[`type_${index}`] ?? '').trim();
      if (!selected) return item;
      return { ...item, category_id: selected, matched: true };
    });
    session.recognized_items = updated;
    await session.save();
    await this.submitMatched(session, skipDuplicates, { allowManualType: true });
  }

  private async submitMatched(
    session: BotSession,
    skipDuplicates: boolean,
    options?: { allowManualType?: boolean },
  ) {
    if (session.status !== 'awaiting_submit') {
      this.logger.warn(
        `忽略 submit：会话状态为 ${session.status} session=${session.session_id}`,
      );
      return;
    }

    if (!session.user_id) {
      const user = await this.identity.resolveUser(session.open_id);
      session.user_id = String(user._id);
    }
    const freshUser = await this.userModel.findById(session.user_id);
    if (!freshUser) return;

    const gaps = this.identity.getProfileGaps(freshUser);
    if (gaps.length > 0) {
      session.status = 'awaiting_profile';
      await session.save();
      const companies = await this.companyService.findNameOptions();
      const card = buildProfileCard(
        session.session_id,
        gaps.map((g) => (g === 'company' ? '报销公司' : '收款账户')),
        companies.map((c) => ({ id: String(c._id), name: c.name })),
      );
      const profileId = await this.feishuApi.sendInteractiveCard(
        session.chat_id,
        card,
      );
      session.message_ids = { ...session.message_ids, profile: profileId };
      await session.save();
      return;
    }

    await this.updateSessionCard(
      session,
      session.message_ids?.result,
      await this.buildResultCardForSession(session, {
        locked: true,
        lockedReason: '提交中…',
      }),
    );

    const items = session.recognized_items.filter((item) => {
      if (!item.category_id) return false;
      if (!options?.allowManualType && !item.matched) return false;
      if (skipDuplicates && item.duplicate) return false;
      return true;
    });
    if (items.length === 0) return;

    const departmentName = await this.identity.resolveDepartmentName(
      session.user_id,
    );
    const applyDate = new Date().toISOString().slice(0, 10);
    const dtos: CreateReimbursementDto[] = [];

    for (const item of items) {
      if (!item.attachment_id) continue;

      dtos.push({
        applicant_name: freshUser.real_name,
        category: String(item.category_id),
        department_name: departmentName,
        apply_date: applyDate,
        details: [item.details],
        attachments: [item.attachment_id],
        invoice_number: item.invoice_number,
        invoice_info: {
          invoice_number: item.invoice_number,
          invoice_title: item.invoice_title,
          invoice_date: item.invoice_date,
          issuer: item.issuer,
        },
      });
    }

    const result = await this.reimbursementService.createBatch(
      session.user_id,
      dtos,
    );
    session.status = 'submitted';
    await session.save();

    await this.updateSessionCard(
      session,
      session.message_ids?.result,
      await this.buildResultCardForSession(session, {
        locked: true,
        lockedReason: '已提交',
      }),
    );

    const total = items.reduce((sum, i) => sum + (i.amount ?? 0), 0);
    const listUrl = `${this.config.get('FRONTEND_URL') ?? ''}`;
    const card = buildSuccessCard(result.count, total, listUrl);
    await this.feishuApi.sendInteractiveCard(session.chat_id, card);
  }

  private async sendResultCardForSession(session: BotSession): Promise<void> {
    const fresh = await this.sessionModel.findOne({
      session_id: session.session_id,
    });
    if (!fresh) return;

    if (fresh.status === 'cancelled') {
      if (!fresh.message_ids?.result) return;
      await this.updateSessionCard(
        fresh,
        fresh.message_ids.result,
        await this.buildResultCardForSession(fresh, { cancelled: true }),
      );
      return;
    }

    const locked = this.resultCardSyncPendingSessions.has(fresh.session_id);
    const typeOptions =
      fresh.user_id && !locked
        ? await this.fetchTypeOptions(fresh.user_id)
        : [];
    const card = buildResultCard(
      fresh.session_id,
      this.mapRecognizedToCardItems(fresh.recognized_items),
      fresh.skipped_names,
      this.resolveResultMode(fresh.recognized_items),
      {
        typeOptions,
        locked,
        lockedReason: locked ? '正在识别补传文件…' : undefined,
      },
    );
    if (fresh.message_ids?.result) {
      await this.updateSessionCard(
        fresh,
        fresh.message_ids.result,
        card.card,
      );
      return;
    }
    const resultId = await this.feishuApi.sendInteractiveCard(
      fresh.chat_id,
      card,
    );
    fresh.message_ids = { ...fresh.message_ids, result: resultId };
    await fresh.save();
  }

  private resolveResultMode(items: BotRecognizedItem[]): ResultCardMode {
    if (items.some((i) => i.duplicate)) return 'has_duplicate';
    const submittable = items.filter((i) => !i.duplicate);
    if (submittable.length === 0) return 'has_unmatched';
    const matchedCount = submittable.filter((i) => i.matched).length;
    if (matchedCount === 0) return 'all_unmatched';
    if (submittable.some((i) => !i.matched)) return 'has_unmatched';
    return 'ready';
  }

  private normalizeExtractGroups(raw: unknown): ExtractRow[][] {
    if (raw == null || typeof raw !== 'object') return [];
    if (!Array.isArray(raw)) return [[raw as ExtractRow]];
    if (raw.length === 0) return [];
    if (Array.isArray(raw[0])) return raw as ExtractRow[][];
    return [raw as ExtractRow[]];
  }

  private pickHeadRow(group: ExtractRow[]): ExtractRow | undefined {
    const withFields = group.filter((row) => (row.fields?.length ?? 0) > 0);
    return withFields[0] ?? group[0];
  }

  private resolveInvoiceNumber(
    group: ExtractRow[],
    head?: ExtractRow,
  ): string {
    for (const row of group) {
      const invoiceNumber = String(row.invoice_number ?? '').trim();
      if (invoiceNumber) return invoiceNumber;
    }
    return String(head?.invoice_number ?? '').trim();
  }

  private buildDetails(row?: ExtractRow): Record<string, unknown> {
    const details: Record<string, unknown> = {};
    for (const field of row?.fields ?? []) {
      if (field.key) details[field.key] = field.value ?? '';
    }
    return details;
  }

  private extractAmount(row?: ExtractRow): number {
    const fields = row?.fields ?? [];
    const calc = fields.find((f) => f.is_calculate);
    if (calc?.value != null) {
      const n = Number(calc.value);
      if (!Number.isNaN(n)) return n;
    }
    const amountField = fields.find((f) =>
      /amount|金额|total/i.test(f.key),
    );
    if (amountField?.value != null) {
      const n = Number(amountField.value);
      if (!Number.isNaN(n)) return n;
    }
    return 0;
  }
}

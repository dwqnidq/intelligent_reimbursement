import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Lark from '@larksuiteoapi/node-sdk';
import { FeishuBotService } from './feishu-bot.service';
import {
  buildCardActionResponse,
  parseCardActionBody,
  wrapCallbackCard,
} from './feishu-card-action.util';

@Injectable()
export class FeishuWsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FeishuWsService.name);
  private wsClient: Lark.WSClient | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly botService: FeishuBotService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('FEISHU_BOT_ENABLED') !== 'true') {
      this.logger.log('飞书机器人未启用（FEISHU_BOT_ENABLED != true）');
      return;
    }

    const mode = this.config.get<string>('FEISHU_BOT_MODE') ?? 'websocket';
    if (mode !== 'websocket') {
      this.logger.log(`飞书机器人使用 ${mode} 模式，跳过长连接`);
      return;
    }

    const appId = this.config.get<string>('FEISHU_APP_ID');
    const appSecret = this.config.get<string>('FEISHU_APP_SECRET');
    if (!appId || !appSecret) {
      this.logger.error('FEISHU_APP_ID / FEISHU_APP_SECRET 未配置，无法启动长连接');
      return;
    }

    const encryptKey = this.config.get<string>('FEISHU_ENCRYPT_KEY') ?? '';

    const sdkLogger = {
      trace: (...args: unknown[]) => this.logger.debug(String(args[0] ?? '')),
      debug: (...args: unknown[]) => this.logger.debug(String(args[0] ?? '')),
      info: (...args: unknown[]) => this.logger.log(String(args[0] ?? '')),
      warn: (...args: unknown[]) => this.logger.warn(String(args[0] ?? '')),
      error: (...args: unknown[]) => this.logger.error(String(args[0] ?? '')),
    };

    this.wsClient = new Lark.WSClient({
      appId,
      appSecret,
      loggerLevel: Lark.LoggerLevel.info,
      logger: sdkLogger,
    });

    const eventDispatcher = new Lark.EventDispatcher({
      encryptKey,
    }).register({
      'im.message.receive_v1': async (data: {
        message?: {
          message_id?: string;
          chat_id?: string;
          message_type?: string;
          content?: string;
        };
        sender?: { sender_id?: { open_id?: string } };
      }) => {
        setImmediate(() => {
          void this.botService
            .handleIncomingMessage(data)
            .catch((err) => this.logger.error('处理飞书消息事件失败', err));
        });
      },
      'card.action.trigger': async (data: Record<string, unknown>) => {
        const parsed = parseCardActionBody(data);
        this.logger.log(
          `收到卡片回调 action=${parsed.actionName ?? 'unknown'} approval=${parsed.approvalRecordId ?? '-'} session=${parsed.sessionId ?? '-'}`,
        );

        if (
          parsed.actionName === 'approval_approve' ||
          parsed.actionName === 'approval_reject'
        ) {
          const result = await this.botService.handleApprovalCardAction(data);
          const content = result?.toastContent ?? '处理中…';
          return {
            toast: {
              type: result?.ok ? 'success' : 'error',
              content,
              i18n: { zh_cn: content, en_us: content },
            },
            ...(result?.card
              ? { card: wrapCallbackCard(result.card) }
              : {}),
          };
        }

        if (
          parsed.actionName === 'cancel_reimburse' ||
          parsed.actionName === 'cancel_submit'
        ) {
          const result = await this.botService.handleCancelSession(data);
          return buildCardActionResponse(parsed.actionName, result?.card);
        }

        if (
          parsed.actionName === 'confirm_reimburse' ||
          parsed.actionName === 'upload_complete'
        ) {
          const prepared = await this.botService.prepareRecognition(data);
          if (prepared?.sessionId) {
            setImmediate(() => {
              void this.botService
                .executeRecognition(prepared.sessionId!)
                .catch((err) => this.logger.error('执行识别失败', err));
            });
          }
          return buildCardActionResponse(parsed.actionName, prepared?.card, {
            rejected: prepared?.rejected,
            syncPending: prepared?.syncPending,
          });
        }

        if (parsed.actionName === 'submit_with_selection') {
          const result = await this.botService.handleSubmitWithSelection(data);
          const content = result.toastContent;
          return {
            toast: {
              type: result.ok ? 'info' : 'warning',
              content,
              i18n: { zh_cn: content, en_us: content },
            },
          };
        }

        setImmediate(() => {
          void this.botService
            .handleCardAction(data)
            .catch((err) => this.logger.error('处理飞书卡片回调失败', err));
        });
        return buildCardActionResponse(parsed.actionName);
      },
    });

    try {
      this.wsClient.start({ eventDispatcher });
      this.logger.log(
        `飞书长连接启动中（appId=${appId.slice(0, 8)}…）。` +
          '请在开放平台「事件配置」选长连接并订阅 im.message.receive_v1；' +
          '在「回调配置」选长连接并订阅 card.action.trigger（与事件配置是两项独立设置）',
      );
    } catch (err) {
      this.logger.error('飞书长连接启动失败', err);
    }
  }

  onModuleDestroy(): void {
    this.wsClient = null;
  }
}

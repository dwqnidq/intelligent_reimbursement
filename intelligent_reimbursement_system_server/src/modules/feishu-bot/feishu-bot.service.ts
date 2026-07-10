import { Injectable, Logger } from '@nestjs/common';
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
import {
  classifyFileName,
  isRecognizableKind,
} from './feishu-file.classifier';
import { extractRecognizableFromZip } from './feishu-zip.util';
import { matchReimbursementType } from './feishu-type-matcher';
import {
  buildConfirmCard,
  buildNoRecognizableCard,
  buildProfileCard,
  buildProgressCard,
  buildResultCard,
  buildSuccessCard,
  type ResultCardMode,
} from './feishu-card.builder';
import { AiService } from '../ai/ai.service';
import { FileService } from '../file/file.service';
import { ReimbursementService } from '../reimbursement/reimbursement.service';
import { ReimbursementTypeService } from '../reimbursement-type/reimbursement-type.service';
import { CompanyService } from '../company/company.service';
import { UserService } from '../user/user.service';
import { User } from '../../schemas/user.schema';
import { CreateReimbursementDto } from '../reimbursement/dto/create-reimbursement.dto';

const MAX_RECOGNIZABLE_FILES = 20;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 100 * 1024 * 1024;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

type DownloadedFile = {
  file_name: string;
  buffer: Buffer;
  mime: string;
  file_key?: string;
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
};

@Injectable()
export class FeishuBotService {
  private readonly logger = new Logger(FeishuBotService.name);

  constructor(
    @InjectModel(BotSession.name)
    private readonly sessionModel: Model<BotSession>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly config: ConfigService,
    private readonly feishuApi: FeishuApiClient,
    private readonly identity: FeishuIdentityService,
    private readonly aiService: AiService,
    private readonly fileService: FileService,
    private readonly reimbursementService: ReimbursementService,
    private readonly typeService: ReimbursementTypeService,
    private readonly companyService: CompanyService,
    private readonly userService: UserService,
  ) {}

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

  handleCardHttp(req: Request, res: Response): void {
    const body = req.body as Record<string, unknown>;
    const token = (body.token as string) ?? (body.header as { token?: string })?.token;
    const expected = this.config.get<string>('FEISHU_VERIFICATION_TOKEN');
    if (expected && token && token !== expected) {
      res.status(401).send('invalid token');
      return;
    }

    res.status(200).json({});

    if (!this.feishuApi.isEnabled()) return;

    setImmediate(() => {
      void this.processCardAction(body).catch((err) => {
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

    const parsed = this.parseIncomingFiles({
      message_id: message.message_id,
      message_type: message.message_type,
      content: message.content,
    });
    if (parsed.sourceFiles.length === 0 && parsed.skipped.length === 0) return;

    const recognizable = parsed.sourceFiles.filter((f) =>
      isRecognizableKind(f.kind),
    ).length;
    const zipCount = parsed.sourceFiles.filter((f) => f.kind === 'zip').length;

    if (recognizable === 0 && zipCount === 0) {
      const card = buildNoRecognizableCard(parsed.skipped);
      await this.feishuApi.sendInteractiveCard(message.chat_id, card);
      return;
    }

    await this.sessionModel.updateMany(
      {
        open_id: openId,
        status: {
          $in: ['awaiting_confirm', 'recognizing', 'awaiting_submit', 'awaiting_profile'],
        },
      },
      { $set: { status: 'cancelled' as BotSessionStatus } },
    );

    const sessionId = randomUUID();
    const session = await this.sessionModel.create({
      session_id: sessionId,
      open_id: openId,
      chat_id: message.chat_id,
      status: 'awaiting_confirm',
      source_files: parsed.sourceFiles,
      skipped_names: parsed.skipped,
      recognized_items: [],
      expires_at: new Date(Date.now() + SESSION_TTL_MS),
    });

    const card = buildConfirmCard(
      sessionId,
      {
        recognizable: recognizable + zipCount,
        zipCount,
        skipCount: parsed.skipped.length,
      },
      parsed.sourceFiles.map((f) => ({ name: f.file_name, kind: f.kind })),
    );
    const messageId = await this.feishuApi.sendInteractiveCard(
      message.chat_id,
      card,
    );
    session.message_ids = { ...session.message_ids, confirm: messageId };
    await session.save();
  }

  private parseIncomingFiles(message: {
    message_id: string;
    message_type?: string;
    content?: string;
  }): { sourceFiles: BotSourceFile[]; skipped: string[] } {
    const sourceFiles: BotSourceFile[] = [];
    const skipped: string[] = [];
    const content = message.content ? JSON.parse(message.content) : {};

    if (message.message_type === 'file' && content.file_key) {
      const fileName = String(content.file_name ?? 'file.bin');
      const kind = classifyFileName(fileName);
      if (isRecognizableKind(kind) || kind === 'zip') {
        sourceFiles.push({
          file_key: content.file_key,
          file_name: fileName,
          kind,
          message_id: message.message_id,
        });
      } else {
        skipped.push(fileName);
      }
      return { sourceFiles, skipped };
    }

    if (message.message_type === 'image' && content.image_key) {
      sourceFiles.push({
        file_key: content.image_key,
        file_name: `image_${content.image_key}.jpg`,
        kind: 'image',
        message_id: message.message_id,
      });
      return { sourceFiles, skipped };
    }

    return { sourceFiles, skipped };
  }

  private async processCardAction(body: Record<string, unknown>) {
    const openId =
      (body.open_id as string) ??
      (body.operator as { open_id?: string })?.open_id;
    const action = body.action as {
      value?: Record<string, string>;
      form_value?: Record<string, string>;
    };
    const value = action?.value ?? {};
    const actionName = value.action;
    const sessionId = value.session_id;
    if (!openId || !actionName) return;

    if (actionName === 'dismiss') return;

    if (!sessionId) return;
    const session = await this.sessionModel.findOne({ session_id: sessionId });
    if (!session || session.open_id !== openId) return;

    if (session.status === 'submitted' && actionName.startsWith('submit')) {
      return;
    }

    switch (actionName) {
      case 'cancel_reimburse':
      case 'cancel_submit':
        session.status = 'cancelled';
        await session.save();
        return;
      case 'confirm_reimburse':
        await this.runRecognition(session);
        return;
      case 'save_profile':
        await this.saveProfile(session, action.form_value ?? {});
        return;
      case 'submit_all_matched':
        await this.submitMatched(session, false);
        return;
      case 'submit_skip_duplicates':
        await this.submitMatched(session, true);
        return;
      default:
        return;
    }
  }

  private async runRecognition(session: BotSession) {
    session.status = 'recognizing';
    await session.save();

    const progressCard = buildProgressCard(session.session_id, 0, 1);
    const progressId = await this.feishuApi.sendInteractiveCard(
      session.chat_id,
      progressCard,
    );
    session.message_ids = { ...session.message_ids, progress: progressId };
    await session.save();

    try {
      const user = await this.identity.resolveUser(session.open_id);
      session.user_id = String(user._id);
      await session.save();

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

      if (downloaded.files.length > MAX_RECOGNIZABLE_FILES) {
        const card = buildNoRecognizableCard([
          ...skipped,
          `超过单次 ${MAX_RECOGNIZABLE_FILES} 个可识别文件限制`,
        ]);
        await this.feishuApi.sendInteractiveCard(session.chat_id, card);
        session.status = 'cancelled';
        await session.save();
        return;
      }

      const base64Files = downloaded.files.map(
        (f) => `${f.file_name}::${f.buffer.toString('base64')}`,
      );
      const raw = await this.aiService.extractReimbursementForm(base64Files);
      const groups = this.normalizeExtractGroups(raw);
      const types = await this.typeService.findAll(String(user._id));
      const systemTypes = types.map((t) => ({
        _id: String(t._id),
        label: t.label,
        name: (t as { name?: string }).name,
        code: t.code,
      }));

      const recognized: BotRecognizedItem[] = [];
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const fileMeta = downloaded.files[i];
        const head = this.pickHeadRow(group);
        const match = matchReimbursementType(
          {
            label: head?.label,
            is_suggested_type: head?.is_suggested_type,
            suggested_type_code: head?.suggested_type_code,
          },
          systemTypes,
        );
        const invoiceNumber = String(head?.invoice_number ?? '').trim();
        let duplicate = Boolean(head?.invoice_duplicate);
        if (invoiceNumber && !duplicate) {
          const check =
            await this.reimbursementService.isInvoiceNumberAvailable(
              invoiceNumber,
            );
          duplicate = !check.available;
        }

        const details = this.buildDetails(head);
        let attachmentId: string | undefined;
        if (fileMeta) {
          const uploaded = await this.fileService.uploadBuffer({
            buffer: fileMeta.buffer,
            originalname: fileMeta.file_name,
            mimetype: fileMeta.mime,
            userId: String(user._id),
            type: 'attachment',
          });
          attachmentId = String(uploaded.id);
        }
        recognized.push({
          file_name: fileMeta?.file_name ?? `file-${i + 1}`,
          category_id: match.matched ? match.category_id : undefined,
          category_label: match.matched
            ? match.category_label
            : String(head?.label ?? ''),
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
      }

      session.recognized_items = recognized;
      session.skipped_names = skipped;
      session.status = 'awaiting_submit';
      await session.save();

      const mode = this.resolveResultMode(recognized);
      const card = buildResultCard(
        session.session_id,
        recognized.map((item) => ({
          file_name: item.file_name,
          category_label: item.category_label,
          matched: item.matched,
          amount: item.amount,
          invoice_number: item.invoice_number,
          invoice_title: item.invoice_title,
          invoice_date: item.invoice_date,
          issuer: item.issuer,
          duplicate: item.duplicate,
        })),
        skipped,
        mode,
      );
      const resultId = await this.feishuApi.sendInteractiveCard(
        session.chat_id,
        card,
      );
      session.message_ids = { ...session.message_ids, result: resultId };
      await session.save();
    } catch (err) {
      this.logger.error('识别失败', err);
      const card = buildNoRecognizableCard([
        ...session.skipped_names,
        '识别失败，请稍后重试',
      ]);
      await this.feishuApi.sendInteractiveCard(session.chat_id, card);
      session.status = 'cancelled';
      await session.save();
    }
  }

  private async collectRecognizableFiles(session: BotSession): Promise<{
    files: DownloadedFile[];
    skipped: string[];
  }> {
    const files: DownloadedFile[] = [];
    const skipped: string[] = [];

    for (const source of session.source_files) {
      if (source.kind === 'zip') {
        const buffer = await this.feishuApi.downloadMessageResource(
          source.message_id ?? '',
          source.file_key,
          'file',
        );
        const extracted = extractRecognizableFromZip(buffer, {
          maxFiles: MAX_RECOGNIZABLE_FILES,
          maxTotalBytes: MAX_ZIP_TOTAL_BYTES,
          maxFileBytes: MAX_FILE_BYTES,
        });
        if (!extracted.ok) {
          skipped.push(`${source.file_name}: ${extracted.reason}`);
          skipped.push(...extracted.skipped);
          continue;
        }
        skipped.push(...extracted.skipped);
        for (const entry of extracted.entries) {
          files.push({
            file_name: entry.file_name,
            buffer: entry.buffer,
            mime: entry.file_name.toLowerCase().endsWith('.pdf')
              ? 'application/pdf'
              : 'image/jpeg',
            file_key: source.file_key,
          });
        }
        continue;
      }

      if (!isRecognizableKind(source.kind)) {
        skipped.push(source.file_name);
        continue;
      }

      const buffer = await this.feishuApi.downloadMessageResource(
        source.message_id ?? '',
        source.file_key,
        source.kind === 'image' ? 'image' : 'file',
      );
      if (buffer.length > MAX_FILE_BYTES) {
        skipped.push(`${source.file_name}: 超过单文件大小限制`);
        continue;
      }
      files.push({
        file_name: source.file_name,
        buffer,
        mime:
          source.kind === 'pdf' ? 'application/pdf' : 'image/jpeg',
        file_key: source.file_key,
      });
    }

    return { files, skipped };
  }

  private async saveProfile(
    session: BotSession,
    formValue: Record<string, string>,
  ) {
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
    session.status = 'awaiting_submit';
    await session.save();
    await this.sendResultCardForSession(session);
  }

  private async submitMatched(session: BotSession, skipDuplicates: boolean) {
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
      await this.feishuApi.sendInteractiveCard(session.chat_id, card);
      return;
    }

    const items = session.recognized_items.filter((item) => {
      if (!item.matched) return false;
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

    const total = items.reduce((sum, i) => sum + (i.amount ?? 0), 0);
    const listUrl = `${this.config.get('FRONTEND_URL') ?? ''}`;
    const card = buildSuccessCard(result.count, total, listUrl);
    await this.feishuApi.sendInteractiveCard(session.chat_id, card);
  }

  private async sendResultCardForSession(session: BotSession) {
    const mode = this.resolveResultMode(session.recognized_items);
    const card = buildResultCard(
      session.session_id,
      session.recognized_items.map((item) => ({
        file_name: item.file_name,
        category_label: item.category_label,
        matched: item.matched,
        amount: item.amount,
        invoice_number: item.invoice_number,
        invoice_title: item.invoice_title,
        invoice_date: item.invoice_date,
        issuer: item.issuer,
        duplicate: item.duplicate,
      })),
      session.skipped_names,
      mode,
    );
    await this.feishuApi.sendInteractiveCard(session.chat_id, card);
  }

  private resolveResultMode(items: BotRecognizedItem[]): ResultCardMode {
    if (items.some((i) => i.duplicate)) return 'has_duplicate';
    if (items.some((i) => !i.matched)) return 'has_unmatched';
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
    const duplicate = group.find((r) => r.invoice_duplicate);
    const withFields = group.filter((r) => (r.fields?.length ?? 0) > 0);
    return duplicate ?? withFields[0] ?? group[0];
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

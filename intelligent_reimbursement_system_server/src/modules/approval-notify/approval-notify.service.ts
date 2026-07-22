import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ApprovalRecord,
  ApproverInfo,
} from '../../schemas/approval_record.schema';
import { Employee } from '../../schemas/employee.schema';
import { FeishuUser } from '../../schemas/feishu_user.schema';
import {
  NotificationDelivery,
} from '../../schemas/notification_delivery.schema';
import { Reimbursement } from '../../schemas/reimbursement_records.schema';
import { User } from '../../schemas/user.schema';
import { NotificationService } from '../notification/notification.service';
import { FeishuApiClient } from '../feishu-bot/feishu-api.client';
import {
  buildApprovalPendingCard,
  buildApprovalResultCard,
  buildApprovalSkippedCard,
  type ApprovalCardResolve,
  type ApprovalReimbursementCardSummary,
} from '../feishu-bot/feishu-card.builder';
import { toApprovalCardSummary } from './approval-card-summary.util';

type ReimbSummary = ApprovalReimbursementCardSummary & {
  applicantId?: string;
  reject_reason?: string;
  applicant?: unknown;
};

@Injectable()
export class ApprovalNotifyService {
  private readonly logger = new Logger(ApprovalNotifyService.name);

  constructor(
    @InjectModel(ApprovalRecord.name)
    private readonly approvalModel: Model<ApprovalRecord>,
    @InjectModel(Reimbursement.name)
    private readonly reimbursementModel: Model<Reimbursement>,
    @InjectModel(Employee.name)
    private readonly empModel: Model<Employee>,
    @InjectModel(FeishuUser.name)
    private readonly feishuUserModel: Model<FeishuUser>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(NotificationDelivery.name)
    private readonly deliveryModel: Model<NotificationDelivery>,
    private readonly notificationService: NotificationService,
    private readonly feishuApi: FeishuApiClient,
  ) {}

  /** 安全调用：失败不影响审批主流程 */
  async safeRun(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`审批通知失败 [${label}]`, err as Error);
    }
  }

  async notifyNodeEntered(approvalRecordId: string): Promise<void> {
    await this.safeRun(`nodeEntered:${approvalRecordId}`, async () => {
      const record = await this.approvalModel.findById(approvalRecordId);
      if (!record || record.status !== 'pending') return;
      const node = record.flow_snapshot.nodes[record.cur_node_idx];
      if (!node) return;

      const reimb = await this.loadReimbursementSummary(record.record_id);
      const targets = node.approvers.filter(
        (a) =>
          a.notify !== false &&
          (a.participation ?? 'pending') === 'pending',
      );

      for (const approver of targets) {
        await this.deliverPending(record, approver, reimb, node.node_id);
      }
    });
  }

  async notifyOrsignSkipped(
    approvalRecordId: string,
    nodeId: string,
    approvedByName: string,
    skippedApproverIds: string[],
  ): Promise<void> {
    await this.safeRun(`orsignSkipped:${approvalRecordId}`, async () => {
      const record = await this.approvalModel.findById(approvalRecordId);
      if (!record) return;
      const reimb = await this.loadReimbursementSummary(record.record_id);
      const resolve: ApprovalCardResolve = {
        kind: 'approved',
        byName: approvedByName,
      };

      for (const approverId of skippedApproverIds) {
        const userId = await this.resolveUserIdByEmployeeId(approverId);
        if (userId) {
          const key = `ar:${approvalRecordId}:node:${nodeId}:emp:${approverId}:skipped`;
          await this.notificationService.createIfAbsent({
            user_id: userId,
            type: 'approval_skipped',
            title: '待办已取消',
            body: `该报销记录已审批通过，审批人：${approvedByName}`,
            payload: {
              approval_record_id: approvalRecordId,
              reimbursement_id: record.record_id,
              node_id: nodeId,
              approved_by_name: approvedByName,
            },
            idempotency_key: `web:${key}`,
          });
        }
      }

      await this.updatePendingFeishuCards(
        approvalRecordId,
        nodeId,
        skippedApproverIds,
        resolve,
        reimb,
      );
    });
  }

  /**
   * 将指定审批人已发送的待审批飞书卡更新为禁用态（本人通过、会签已处理、驳回等）。
   * 返回构建好的卡片内容，供飞书回调即时回写。
   */
  async invalidatePendingFeishuCards(
    approvalRecordId: string,
    nodeId: string,
    approverIds: string[],
    resolve: ApprovalCardResolve,
  ): Promise<{ card?: unknown } | null> {
    let built: { card?: unknown } | null = null;
    await this.safeRun(`invalidatePending:${approvalRecordId}`, async () => {
      const record = await this.approvalModel.findById(approvalRecordId);
      if (!record) return;
      const reimb = await this.loadReimbursementSummary(record.record_id);
      built = buildApprovalSkippedCard({ resolve, ...reimb });
      await this.updatePendingFeishuCards(
        approvalRecordId,
        nodeId,
        approverIds,
        resolve,
        reimb,
      );
    });
    return built;
  }

  /** 按审批记录构建已处理卡（飞书回调即时回写用） */
  async buildResolvedCardForRecord(
    approvalRecordId: string,
    resolve: ApprovalCardResolve,
  ): Promise<{ msg_type: string; card: unknown } | null> {
    const record = await this.approvalModel.findById(approvalRecordId);
    if (!record) return null;
    const reimb = await this.loadReimbursementSummary(record.record_id);
    return buildApprovalSkippedCard({ resolve, ...reimb });
  }

  async notifyFinalResult(approvalRecordId: string): Promise<void> {
    await this.safeRun(`finalResult:${approvalRecordId}`, async () => {
      const record = await this.approvalModel.findById(approvalRecordId);
      if (!record) return;
      if (record.status !== 'approved' && record.status !== 'rejected') return;

      const reimb = await this.loadReimbursementSummary(record.record_id);
      const applicantId =
        reimb.applicantId ||
        (typeof reimb.applicant === 'string'
          ? reimb.applicant
          : (reimb.applicant as { _id?: string })?._id?.toString());
      if (!applicantId) return;

      const approved = record.status === 'approved';
      const title = approved ? '报销已通过' : '报销已驳回';
      const body = approved
        ? `您的报销「${reimb.category}」${Number(reimb.amount).toFixed(2)} 元已审批通过`
        : `您的报销「${reimb.category}」已被驳回${reimb.reject_reason ? `：${reimb.reject_reason}` : ''}`;

      const key = `ar:${approvalRecordId}:result`;
      await this.notificationService.createIfAbsent({
        user_id: applicantId,
        type: 'approval_result',
        title,
        body,
        payload: {
          approval_record_id: approvalRecordId,
          reimbursement_id: record.record_id,
          status: record.status,
        },
        idempotency_key: `web:${key}`,
      });

      if (!this.feishuApi.isEnabled()) return;
      const openId = await this.resolveOpenIdByUserId(applicantId);
      const feishuKey = `feishu:${key}`;
      if (!(await this.deliveryExists(feishuKey))) {
        if (!openId) {
          await this.deliveryModel.create({
            channel: 'feishu',
            status: 'skipped_no_binding',
            idempotency_key: feishuKey,
          });
          return;
        }
        try {
          const messageId = await this.feishuApi.sendInteractiveCardToOpenId(
            openId,
            buildApprovalResultCard({
              approved,
              category: reimb.category,
              amount: reimb.amount,
              comment: reimb.reject_reason,
            }),
          );
          await this.deliveryModel.create({
            channel: 'feishu',
            status: 'sent',
            feishu_message_id: messageId,
            idempotency_key: feishuKey,
          });
        } catch (err) {
          await this.deliveryModel.create({
            channel: 'feishu',
            status: 'failed',
            idempotency_key: feishuKey,
            error: (err as Error).message,
          });
        }
      }
    });
  }

  async notifyTransferTarget(
    approvalRecordId: string,
    approverId: string,
  ): Promise<void> {
    await this.safeRun(`transfer:${approvalRecordId}:${approverId}`, async () => {
      const record = await this.approvalModel.findById(approvalRecordId);
      if (!record || record.status !== 'pending') return;
      const node = record.flow_snapshot.nodes[record.cur_node_idx];
      const approver = node?.approvers.find((a) => a.approver_id === approverId);
      if (!approver || approver.notify === false) return;
      const reimb = await this.loadReimbursementSummary(record.record_id);
      await this.deliverPending(record, approver, reimb, node.node_id);
    });
  }

  /**
   * 撤回后：作废旧飞书卡 → 清理投递/站内幂等 → 向第一节点重新 notifyNodeEntered。
   * 失败不抛出（safeRun）。
   */
  async reopenAfterWithdraw(approvalRecordId: string): Promise<void> {
    await this.safeRun(`reopenAfterWithdraw:${approvalRecordId}`, async () => {
      const record = await this.approvalModel.findById(approvalRecordId);
      if (!record || record.status !== 'pending') return;

      const reimb = await this.loadReimbursementSummary(record.record_id);
      const resolve: ApprovalCardResolve = { kind: 'withdrawn' };
      const cardPayload = buildApprovalSkippedCard({ resolve, ...reimb });

      const keyNeedle = `ar:${approvalRecordId}`;
      const deliveries = await this.deliveryModel.find({
        idempotency_key: { $regex: keyNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') },
      });

      if (this.feishuApi.isEnabled()) {
        for (const delivery of deliveries) {
          if (!delivery.feishu_message_id) continue;
          try {
            await this.feishuApi.updateInteractiveCard(
              delivery.feishu_message_id,
              cardPayload,
            );
            delivery.status = 'updated';
            await delivery.save();
          } catch (err) {
            this.logger.warn(
              `撤回作废飞书卡失败 key=${delivery.idempotency_key}`,
              err as Error,
            );
          }
        }
      }

      await this.deliveryModel.deleteMany({
        idempotency_key: {
          $regex: keyNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        },
      });
      await this.notificationService.deleteByIdempotencyKeyRegex(
        new RegExp(keyNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );

      await this.notifyNodeEntered(approvalRecordId);
    });
  }

  private async updatePendingFeishuCards(
    approvalRecordId: string,
    nodeId: string,
    approverIds: string[],
    resolve: ApprovalCardResolve,
    reimb: ReimbSummary,
  ): Promise<void> {
    if (!this.feishuApi.isEnabled() || approverIds.length === 0) return;
    const cardPayload = buildApprovalSkippedCard({ resolve, ...reimb });

    for (const approverId of approverIds) {
      const pendingKey = `feishu:ar:${approvalRecordId}:node:${nodeId}:emp:${approverId}:pending`;
      const delivery = await this.deliveryModel.findOne({
        idempotency_key: pendingKey,
      });
      if (delivery?.feishu_message_id) {
        try {
          await this.feishuApi.updateInteractiveCard(
            delivery.feishu_message_id,
            cardPayload,
          );
          delivery.status = 'updated';
          await delivery.save();
        } catch (err) {
          this.logger.warn(
            `更新待审批失效卡片失败 emp=${approverId}`,
            err as Error,
          );
        }
        continue;
      }

      // 无原卡时补发一条禁用态说明（仅绑定飞书）
      const openId = await this.resolveOpenIdByEmployeeId(approverId);
      if (!openId) continue;
      const skipKey = `feishu:ar:${approvalRecordId}:node:${nodeId}:emp:${approverId}:skipped`;
      if (await this.deliveryExists(skipKey)) continue;
      try {
        const messageId = await this.feishuApi.sendInteractiveCardToOpenId(
          openId,
          cardPayload,
        );
        await this.deliveryModel.create({
          channel: 'feishu',
          status: 'sent',
          feishu_message_id: messageId,
          idempotency_key: skipKey,
          meta: { category: reimb.category },
        });
      } catch (err) {
        this.logger.warn(
          `发送审批失效卡失败 emp=${approverId}`,
          err as Error,
        );
      }
    }
  }

  private async deliverPending(
    record: ApprovalRecord,
    approver: ApproverInfo,
    reimb: ReimbSummary,
    nodeId: string,
  ) {
    const userId = await this.resolveUserIdByEmployeeId(approver.approver_id);
    const baseKey = `ar:${String(record._id)}:node:${nodeId}:emp:${approver.approver_id}:pending`;

    if (userId) {
      await this.notificationService.createIfAbsent({
        user_id: userId,
        type: 'approval_pending',
        title: '待审批报销',
        body: `${reimb.applicantName} 提交了「${reimb.category}」报销 ${Number(reimb.amount).toFixed(2)} 元，请审批`,
        payload: {
          approval_record_id: String(record._id),
          reimbursement_id: record.record_id,
          node_id: nodeId,
        },
        idempotency_key: `web:${baseKey}`,
      });
      await this.markDelivery('web', `web:${baseKey}`, 'sent');
    }

    if (!this.feishuApi.isEnabled()) return;
    const feishuKey = `feishu:${baseKey}`;
    if (await this.deliveryExists(feishuKey)) return;

    const openId = await this.resolveOpenIdByEmployeeId(approver.approver_id);
    if (!openId) {
      await this.deliveryModel.create({
        channel: 'feishu',
        status: 'skipped_no_binding',
        idempotency_key: feishuKey,
      });
      return;
    }

    try {
      const messageId = await this.feishuApi.sendInteractiveCardToOpenId(
        openId,
        buildApprovalPendingCard({
          approvalRecordId: String(record._id),
          ...reimb,
        }),
      );
      await this.deliveryModel.create({
        channel: 'feishu',
        status: 'sent',
        feishu_message_id: messageId,
        idempotency_key: feishuKey,
      });
    } catch (err) {
      await this.deliveryModel.create({
        channel: 'feishu',
        status: 'failed',
        idempotency_key: feishuKey,
        error: (err as Error).message,
      });
    }
  }

  private async loadReimbursementSummary(
    reimbursementId: string,
  ): Promise<ReimbSummary> {
    const doc = await this.reimbursementModel
      .findById(reimbursementId)
      .populate('applicant', 'real_name')
      .populate({ path: 'attachments', select: 'url original_name' })
      .populate({ path: 'category', select: 'fields label name' })
      .lean();

    const category = (doc as { category?: unknown } | null)?.category;
    const typeFields =
      category && typeof category === 'object'
        ? ((category as { fields?: Array<{ key: string; label: string; sort?: number }> })
            .fields || [])
        : undefined;

    const categoryName =
      (doc as { category_name?: string } | null)?.category_name ||
      (category && typeof category === 'object'
        ? (category as { label?: string; name?: string }).label ||
          (category as { name?: string }).name ||
          ''
        : '');

    const summary = toApprovalCardSummary(
      {
        ...((doc || {}) as Record<string, unknown>),
        category_name: categoryName,
        detail:
          doc && typeof (doc as { detail?: unknown }).detail === 'object'
            ? ((doc as { detail: Record<string, unknown> }).detail)
            : undefined,
        applicant: (doc as { applicant?: unknown } | null)?.applicant as
          | { _id?: { toString(): string }; real_name?: string }
          | string
          | undefined,
        attachments: (doc as { attachments?: unknown } | null)?.attachments as
          | { url?: string; original_name?: string }[]
          | string[]
          | undefined,
        reject_reason:
          (doc as { reject_reason?: string } | null)?.reject_reason || '',
        amount: (doc as { amount?: number } | null)?.amount,
        apply_date: (doc as { apply_date?: string } | null)?.apply_date,
        company_name: (doc as { company_name?: string } | null)?.company_name,
        payment_account: (doc as { payment_account?: string } | null)
          ?.payment_account,
      },
      typeFields,
    );
    return {
      ...summary,
      applicant: (doc as { applicant?: unknown } | null)?.applicant,
      reject_reason:
        (doc as { reject_reason?: string } | null)?.reject_reason || '',
    };
  }

  private async resolveUserIdByEmployeeId(
    employeeId: string,
  ): Promise<string | null> {
    const emp = await this.empModel.findById(employeeId).lean();
    if (!emp?.uid) return null;
    return String(emp.uid);
  }

  private async resolveOpenIdByEmployeeId(
    employeeId: string,
  ): Promise<string | null> {
    const userId = await this.resolveUserIdByEmployeeId(employeeId);
    if (!userId) return null;
    return this.resolveOpenIdByUserId(userId);
  }

  private async resolveOpenIdByUserId(userId: string): Promise<string | null> {
    const row = await this.feishuUserModel.findOne({ uid: userId }).lean();
    return row?.open_id ?? null;
  }

  private async deliveryExists(key: string): Promise<boolean> {
    const found = await this.deliveryModel.exists({ idempotency_key: key });
    return !!found;
  }

  private async markDelivery(
    channel: 'web' | 'feishu',
    key: string,
    status: string,
  ) {
    try {
      await this.deliveryModel.create({
        channel,
        status,
        idempotency_key: key,
      });
    } catch (err: unknown) {
      if ((err as { code?: number })?.code !== 11000) throw err;
    }
  }
}

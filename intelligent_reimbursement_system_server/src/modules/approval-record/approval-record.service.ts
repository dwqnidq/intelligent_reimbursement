import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ApprovalRecord,
  SnapshotNode,
  ApproverInfo,
} from '../../schemas/approval_record.schema';
import { ApprovalFlow } from '../../schemas/approval_flow.schema';
import { Employee } from '../../schemas/employee.schema';
import { Department } from '../../schemas/department.schema';
import { Reimbursement } from '../../schemas/reimbursement_records.schema';
import { User } from '../../schemas/user.schema';
import { ApprovalNotifyService } from '../approval-notify/approval-notify.service';
import { PromiseChainLock } from '../feishu-bot/feishu-promise-chain-lock.util';
import { resetFlowSnapshotForReapproval } from './approval-record-reset.util';

@Injectable()
export class ApprovalRecordService {
  /** 同一审批单的通过/驳回/转审串行，避免飞书卡连点竞态 */
  private readonly decisionLock = new PromiseChainLock();

  constructor(
    @InjectModel(ApprovalRecord.name)
    private recordModel: Model<ApprovalRecord>,
    @InjectModel(ApprovalFlow.name)
    private flowModel: Model<ApprovalFlow>,
    @InjectModel(Employee.name)
    private empModel: Model<Employee>,
    @InjectModel(Department.name)
    private deptModel: Model<Department>,
    @InjectModel(Reimbursement.name)
    private reimbursementModel: Model<Reimbursement>,
    @InjectModel(User.name)
    private userModel: Model<User>,
    @Optional()
    private readonly approvalNotify?: ApprovalNotifyService,
  ) {}

  private async tryGetEmployee(
    userId: string,
  ): Promise<InstanceType<typeof Employee> | null> {
    let emp = await this.empModel.findOne({ uid: userId });
    if (emp) return emp;

    const user = await this.userModel.findById(userId);
    if (!user) return null;

    emp = await this.empModel.findOne({ name: user.real_name, uid: null });
    if (emp) {
      emp.uid = user._id as any;
      await emp.save();
      return emp;
    }

    return null;
  }

  private async getEmployee(userId: string): Promise<InstanceType<typeof Employee>> {
    const emp = await this.tryGetEmployee(userId);
    if (!emp) {
      throw new NotFoundException('员工信息不存在，请先注册或通过飞书登录');
    }
    return emp;
  }

  // Called when submitting reimbursement: create approval record with snapshot
  async create(reimbursementId: string, typeCode: string, amount?: number) {
    const baseFilter: Record<string, unknown> = { type_code: typeCode, enabled: true };

    // Get all enabled flows for this type, sorted by priority ascending
    const allFlows = await this.flowModel
      .find(baseFilter)
      .sort({ priority: 1 })
      .populate('nodes.approver_ids');

    let flow: InstanceType<typeof ApprovalFlow> | null = null;

    // First pass: find the highest-priority flow whose amount range matches
    if (amount != null) {
      for (const f of allFlows) {
        const minOk = (f.amount_min ?? 0) <= amount;
        const maxOk = f.amount_max == null || f.amount_max > amount;
        if (minOk && maxOk) {
          flow = f;
          break;
        }
      }
    }

    // Fallback: default flow (amount_min=0, amount_max=null), or first enabled flow
    if (!flow) {
      flow = allFlows.find((f) => f.amount_min === 0 && f.amount_max == null) ?? allFlows[0] ?? null;
    }

    if (!flow) return null; // No approval flow or not enabled — auto-pass

    // Build snapshot: flatten approver info for each node
    const snapshotNodes: SnapshotNode[] = [];
    for (const node of flow.nodes) {
      const approvers: ApproverInfo[] = [];
      const empIds = node.approver_ids as unknown as InstanceType<typeof Employee>[];
      const notifyFlags = (node as { notify_flags?: boolean[] }).notify_flags ?? [];
      for (let i = 0; i < empIds.length; i++) {
        const emp = empIds[i];
        if (!emp) continue;
        let deptName = '';
        if (emp.dept_id) {
          const dept = await this.deptModel.findById(emp.dept_id);
          deptName = dept?.name || '';
        }
        const notify = notifyFlags[i] !== false;
        approvers.push({
          approver_id: (emp._id as any).toString(),
          name: emp.name,
          avatar: emp.avatar || '',
          dept_name: deptName,
          position: emp.position || '',
          notify,
          participation: 'pending',
        });
      }
      snapshotNodes.push({
        node_id: node.node_id,
        sign_type: node.sign_type,
        approvers,
        approved_by: [],
        transfers: {},
      });
    }

    const record = await this.recordModel.create({
      record_id: reimbursementId,
      flow_snapshot: {
        nodes: snapshotNodes,
      },
      cur_node_idx: 0,
      status: 'pending',
      actions: [],
    });

    void this.approvalNotify?.notifyNodeEntered(String(record._id));

    return record;
  }

  // Get approval record by reimbursement id
  async findByReimbursementId(reimbursementId: string) {
    return this.recordModel.findOne({
      record_id: reimbursementId,
    });
  }

  /**
   * 撤回后原地重置审批记录（清转审加人、进度与操作日志），不发通知。
   * 无审批记录时返回 null。
   */
  async resetForReapproval(
    reimbursementId: string,
  ): Promise<ApprovalRecord | null> {
    const record = await this.recordModel.findOne({
      record_id: reimbursementId,
    });
    if (!record) return null;

    record.status = 'pending';
    record.cur_node_idx = 0;
    record.actions = [];
    record.flow_snapshot = resetFlowSnapshotForReapproval(
      record.flow_snapshot,
    ) as ApprovalRecord['flow_snapshot'];
    await record.save();
    return record;
  }

  /** 撤回：重置审批数据并异步重开第一节点推送 */
  async resetAndReopenAfterWithdraw(
    reimbursementId: string,
  ): Promise<ApprovalRecord | null> {
    const record = await this.resetForReapproval(reimbursementId);
    if (record) {
      void this.approvalNotify?.reopenAfterWithdraw(String(record._id));
    }
    return record;
  }

  /** 当前用户是否仍可在该节点审批（排除 skipped / 已批） */
  private canActOnNode(
    node: SnapshotNode,
    empName: string,
  ): { ok: boolean; reason?: string; me?: ApproverInfo } {
    const me = node.approvers.find((a) => a.name === empName);
    if (!me) return { ok: false, reason: '您不是当前节点的审批人' };
    if (me.participation === 'skipped') {
      return { ok: false, reason: 'skipped', me };
    }
    if (
      me.participation === 'approved' ||
      me.participation === 'rejected' ||
      node.approved_by?.includes(empName)
    ) {
      return { ok: false, reason: '您已审批过该节点', me };
    }
    return { ok: true, me };
  }

  private findApprovedByName(node: SnapshotNode): string | undefined {
    const approved = node.approvers.find((a) => a.participation === 'approved');
    if (approved) return approved.name;
    return node.approved_by?.[0];
  }

  // Get my pending approvals list with populated reimbursement data
  async findMyPending(userId: string) {
    const emp = await this.tryGetEmployee(userId);
    if (!emp) return [];
    const allPending = await this.recordModel.find({ status: 'pending' });
    const actionable = allPending.filter((record) => {
      const curNode = record.flow_snapshot.nodes[record.cur_node_idx];
      if (!curNode) return false;
      const me = curNode.approvers.find((a) => a.name === emp.name);
      if (!me) return false;
      if (me.participation === 'skipped') return false;
      if (me.participation === 'approved' || me.participation === 'rejected') {
        return false;
      }
      if (curNode.approved_by?.includes(emp.name)) return false;
      return true;
    });

    // 或签被跳过：仍返回给前端用于灰显提示（不与可审批记录重复）
    const skippedOnly = allPending.filter((record) => {
      if (actionable.includes(record)) return false;
      return record.flow_snapshot.nodes.some((node) =>
        node.approvers.some(
          (a) => a.name === emp.name && a.participation === 'skipped',
        ),
      );
    });

    const result: Record<string, unknown>[] = [];
    const pushItem = async (
      record: ApprovalRecord,
      ui: { ui_state: string; approved_by_name?: string },
    ) => {
      const reimbursement = await this.reimbursementModel
        .findById(record.record_id)
        .populate('applicant', 'real_name')
        .populate('attachments', 'url')
        .lean();

      if (!reimbursement) return;

      result.push({
        approval_record: {
          _id: record._id,
          record_id: record.record_id,
          flow_snapshot: record.flow_snapshot,
          cur_node_idx: record.cur_node_idx,
          status: record.status,
          actions: record.actions,
        },
        reimbursement: {
          _id: reimbursement._id,
          category: (reimbursement as any).category_name || '',
          amount: (reimbursement as any).amount,
          apply_date: (reimbursement as any).apply_date,
          status: (reimbursement as any).status,
          is_over_limit: (reimbursement as any).is_over_limit,
          applicant_name: (reimbursement as any).applicant?.real_name || '',
          attachments: ((reimbursement as any).attachments || []).map(
            (f: any) => f.url || '',
          ),
          reject_reason: (reimbursement as any).reject_reason,
        },
        ...ui,
      });
    };

    for (const record of actionable) {
      await pushItem(record, { ui_state: 'pending' });
    }
    for (const record of skippedOnly) {
      let approvedBy = '';
      for (const node of record.flow_snapshot.nodes) {
        const me = node.approvers.find(
          (a) => a.name === emp.name && a.participation === 'skipped',
        );
        if (me) {
          approvedBy = this.findApprovedByName(node) || '';
          break;
        }
      }
      await pushItem(record, {
        ui_state: 'skipped',
        approved_by_name: approvedBy,
      });
    }
    return result;
  }

  // Get my approval history (records I have participated in)
  async findMyHistory(userId: string) {
    const emp = await this.tryGetEmployee(userId);
    if (!emp) return [];
    const allRecords = await this.recordModel.find({});
    const results: Record<string, unknown>[] = [];

    for (const record of allRecords) {
      // 仅展示本人有过操作的记录（撤回重置后 actions 为空则从历史消失）
      const myAction = record.actions.find((a) => a.approver_name === emp.name);
      if (!myAction) continue;

      const reimbursement = await this.reimbursementModel
        .findById(record.record_id)
        .populate('applicant', 'real_name')
        .populate('attachments', 'url')
        .lean();

      if (!reimbursement) continue;

      results.push({
        approval_record: {
          _id: record._id,
          record_id: record.record_id,
          flow_snapshot: record.flow_snapshot,
          cur_node_idx: record.cur_node_idx,
          status: record.status,
          actions: record.actions,
        },
        reimbursement: {
          _id: reimbursement._id,
          category: (reimbursement as any).category_name || '',
          amount: (reimbursement as any).amount,
          apply_date: (reimbursement as any).apply_date,
          status: (reimbursement as any).status,
          is_over_limit: (reimbursement as any).is_over_limit,
          applicant_name: (reimbursement as any).applicant?.real_name || '',
        },
        my_action: myAction
          ? {
              action: myAction.action,
              acted_at: myAction.acted_at,
              comment: myAction.comment,
              transferred_to_name: myAction.transferred_to_name,
            }
          : null,
      });
    }

    return results;
  }

  // Approve
  async approve(recordId: string, userId: string, comment?: string) {
    return this.decisionLock.run(`ar:${recordId}`, () =>
      this.executeApprove(recordId, userId, comment),
    );
  }

  private async executeApprove(
    recordId: string,
    userId: string,
    comment?: string,
  ) {
    const record = await this.recordModel.findById(recordId);
    if (!record) throw new NotFoundException('审批记录不存在');
    if (record.status !== 'pending')
      throw new BadRequestException('该审批已结束');

    const emp = await this.getEmployee(userId);

    const curNode = record.flow_snapshot.nodes[record.cur_node_idx];
    if (!curNode) throw new BadRequestException('当前节点不存在');

    const act = this.canActOnNode(curNode, emp.name);
    if (!act.ok) {
      if (act.reason === 'skipped') {
        const by = this.findApprovedByName(curNode);
        throw new BadRequestException(
          by
            ? `该报销记录已审批通过，审批人：${by}`
            : '该报销记录已由其他审批人处理',
        );
      }
      throw new BadRequestException(act.reason || '无法审批');
    }

    record.actions.push({
      node_id: curNode.node_id,
      approver_name: emp.name,
      action: 'approve',
      comment: comment || '',
      acted_at: new Date(),
    } as any);

    if (!curNode.approved_by) curNode.approved_by = [];
    curNode.approved_by.push(emp.name);
    if (act.me) act.me.participation = 'approved';

    const skippedApproverIds: string[] = [];
    let nodeAdvanced = false;

    if (curNode.sign_type === 'orsign') {
      for (const a of curNode.approvers) {
        if (a.name !== emp.name && (a.participation ?? 'pending') === 'pending') {
          a.participation = 'skipped';
          skippedApproverIds.push(a.approver_id);
        }
      }
      record.cur_node_idx += 1;
      nodeAdvanced = true;
    } else {
      const allApproved = curNode.approvers.every(
        (a) =>
          a.participation === 'approved' ||
          curNode.approved_by.includes(a.name),
      );
      if (allApproved) {
        record.cur_node_idx += 1;
        nodeAdvanced = true;
      }
    }

    let finalized = false;
    if (record.cur_node_idx >= record.flow_snapshot.nodes.length) {
      record.status = 'approved';
      finalized = true;
      await this.reimbursementModel.findByIdAndUpdate(record.record_id, {
        status: 'approved',
      });
    }

    await record.save();

    const actorApproverId = act.me?.approver_id;
    const resolveKind =
      nodeAdvanced || finalized ? ('approved' as const) : ('self_done' as const);

    if (skippedApproverIds.length > 0) {
      void this.approvalNotify?.notifyOrsignSkipped(
        String(record._id),
        curNode.node_id,
        emp.name,
        skippedApproverIds,
      );
    }
    // 后台/飞书通过后禁用操作者本人待审批卡（飞书回调也会再回写一版）
    if (actorApproverId) {
      void this.approvalNotify?.invalidatePendingFeishuCards(
        String(record._id),
        curNode.node_id,
        [actorApproverId],
        { kind: resolveKind, byName: emp.name },
      );
    }
    if (nodeAdvanced && !finalized) {
      void this.approvalNotify?.notifyNodeEntered(String(record._id));
    }
    if (finalized) {
      void this.approvalNotify?.notifyFinalResult(String(record._id));
    }

    return {
      record,
      meta: {
        skippedApproverIds,
        nodeAdvanced,
        finalized,
        approvedByName: emp.name,
        nodeId: curNode.node_id,
        resolveKind,
      },
    };
  }

  // Reject
  async reject(recordId: string, userId: string, comment?: string) {
    return this.decisionLock.run(`ar:${recordId}`, () =>
      this.executeReject(recordId, userId, comment),
    );
  }

  private async executeReject(
    recordId: string,
    userId: string,
    comment?: string,
  ) {
    const record = await this.recordModel.findById(recordId);
    if (!record) throw new NotFoundException('审批记录不存在');
    if (record.status !== 'pending')
      throw new BadRequestException('该审批已结束');

    const emp = await this.getEmployee(userId);

    const curNode = record.flow_snapshot.nodes[record.cur_node_idx];
    if (!curNode) throw new BadRequestException('当前节点不存在');

    const act = this.canActOnNode(curNode, emp.name);
    if (!act.ok) {
      if (act.reason === 'skipped') {
        const by = this.findApprovedByName(curNode);
        throw new BadRequestException(
          by
            ? `该报销记录已审批通过，审批人：${by}`
            : '该报销记录已由其他审批人处理',
        );
      }
      throw new BadRequestException(act.reason || '无法审批');
    }

    record.actions.push({
      node_id: curNode.node_id,
      approver_name: emp.name,
      action: 'reject',
      comment: comment || '',
      acted_at: new Date(),
    } as any);

    if (act.me) act.me.participation = 'rejected';

    record.status = 'rejected';
    await this.reimbursementModel.findByIdAndUpdate(record.record_id, {
      status: 'rejected',
      reject_reason: comment || '审批驳回',
    });

    await record.save();

    const rejectTargetIds = curNode.approvers
      .filter((a) => a.notify !== false)
      .map((a) => a.approver_id);
    if (rejectTargetIds.length > 0) {
      void this.approvalNotify?.invalidatePendingFeishuCards(
        String(record._id),
        curNode.node_id,
        rejectTargetIds,
        { kind: 'rejected', byName: emp.name },
      );
    }
    void this.approvalNotify?.notifyFinalResult(String(record._id));
    return {
      record,
      meta: {
        finalized: true as const,
        approvedByName: emp.name,
        nodeId: curNode.node_id,
        resolveKind: 'rejected' as const,
      },
    };
  }

  // Transfer (转审)
  async transfer(
    recordId: string,
    userId: string,
    targetEmployeeId: string,
    comment?: string,
  ) {
    return this.decisionLock.run(`ar:${recordId}`, () =>
      this.executeTransfer(recordId, userId, targetEmployeeId, comment),
    );
  }

  private async executeTransfer(
    recordId: string,
    userId: string,
    targetEmployeeId: string,
    comment?: string,
  ) {
    const record = await this.recordModel.findById(recordId);
    if (!record) throw new NotFoundException('审批记录不存在');
    if (record.status !== 'pending')
      throw new BadRequestException('该审批已结束');

    const emp = await this.getEmployee(userId);

    const targetEmp = await this.empModel.findById(targetEmployeeId);
    if (!targetEmp) throw new NotFoundException('目标审批人不存在');

    const curNode = record.flow_snapshot.nodes[record.cur_node_idx];
    if (!curNode) throw new BadRequestException('当前节点不存在');

    const act = this.canActOnNode(curNode, emp.name);
    if (!act.ok) {
      if (act.reason === 'skipped') {
        const by = this.findApprovedByName(curNode);
        throw new BadRequestException(
          by
            ? `该报销记录已审批通过，审批人：${by}`
            : '该报销记录已由其他审批人处理',
        );
      }
      throw new BadRequestException(act.reason || '无法审批');
    }

    record.actions.push({
      node_id: curNode.node_id,
      approver_name: emp.name,
      action: 'transfer',
      comment: comment || '',
      acted_at: new Date(),
      transferred_to_name: targetEmp.name,
    } as any);

    if (!curNode.transfers) curNode.transfers = {};
    curNode.transfers[emp.name] = targetEmp.name;

    const alreadyApprover = curNode.approvers.some(
      (a) => a.name === targetEmp.name,
    );
    if (alreadyApprover) {
      throw new BadRequestException('该审批人已在当前节点中，无法转审');
    }

    let deptName = '';
    if (targetEmp.dept_id) {
      const dept = await this.deptModel.findById(targetEmp.dept_id);
      deptName = dept?.name || '';
    }
    curNode.approvers.push({
      approver_id: (targetEmp._id as any).toString(),
      name: targetEmp.name,
      avatar: targetEmp.avatar || '',
      dept_name: deptName,
      position: targetEmp.position || '',
      notify: true,
      participation: 'pending',
    });

    await record.save();
    void this.approvalNotify?.notifyTransferTarget(
      String(record._id),
      (targetEmp._id as any).toString(),
    );
    return {
      record,
      meta: {
        transferredApproverId: (targetEmp._id as any).toString(),
        nodeId: curNode.node_id,
      },
    };
  }
}

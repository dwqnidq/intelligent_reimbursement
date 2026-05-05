import {
  Injectable,
  NotFoundException,
  BadRequestException,
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

@Injectable()
export class ApprovalRecordService {
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
  ) {}

  private async getEmployee(userId: string): Promise<InstanceType<typeof Employee>> {
    let emp = await this.empModel.findOne({ uid: userId });
    console.log('getEmployee', { userId, emp });
    if (emp) return emp;

    // Fallback: find user by ID, then match employee by name and auto-link
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('用户不存在');

    emp = await this.empModel.findOne({ name: user.real_name, uid: null });
    if (emp) {
      emp.uid = user._id as any;
      await emp.save();
      return emp;
    }

    throw new NotFoundException('员工信息不存在，请先注册或通过飞书登录');
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
      for (const emp of empIds) {
        if (!emp) continue;
        let deptName = '';
        if (emp.dept_id) {
          const dept = await this.deptModel.findById(emp.dept_id);
          deptName = dept?.name || '';
        }
        approvers.push({
          approver_id: (emp._id as any).toString(),
          name: emp.name,
          avatar: emp.avatar || '',
          dept_name: deptName,
          position: emp.position || '',
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

    return record;
  }

  // Get approval record by reimbursement id
  async findByReimbursementId(reimbursementId: string) {
    return this.recordModel.findOne({
      record_id: reimbursementId,
    });
  }

  // Get my pending approvals list with populated reimbursement data
  async findMyPending(userId: string) {
    const emp = await this.getEmployee(userId);
    const allPending = await this.recordModel.find({ status: 'pending' });
    // 只返回当前审批节点包含当前用户的记录
    const records = allPending.filter((record) => {
      const curNode = record.flow_snapshot.nodes[record.cur_node_idx];
      if (!curNode) return false;
      return curNode.approvers.some((a) => a.name === emp.name);
    });
    const result: Record<string, unknown>[] = [];
    for (const record of records) {
      const reimbursement = await this.reimbursementModel
        .findById(record.record_id)
        .populate('applicant', 'real_name')
        .populate('attachments', 'url')
        .lean();

      if (!reimbursement) continue;

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
      });
    }
    return result;
  }

  // Get my approval history (records I have participated in)
  async findMyHistory(userId: string) {
    const emp = await this.getEmployee(userId);
    const allRecords = await this.recordModel.find({});
    const results: Record<string, unknown>[] = [];

    for (const record of allRecords) {
      // Check if user has any action in this record
      const myAction = record.actions.find((a) => a.approver_name === emp.name);

      // Check if user is an approver in any node
      const isApproverInAnyNode = record.flow_snapshot.nodes.some(
        (node) => node.approvers.some((a) => a.name === emp.name),
      );

      if (!myAction && !isApproverInAnyNode) continue;

      // If record is pending and user is on the current node without action, skip (that's findMyPending's job)
      if (record.status === 'pending') {
        const curNode = record.flow_snapshot.nodes[record.cur_node_idx];
        if (curNode?.approvers.some((a) => a.name === emp.name)) {
          const actedOnCurrentNode = record.actions.some(
            (a) => a.approver_name === emp.name && a.node_id === curNode.node_id,
          );
          if (!actedOnCurrentNode) continue;
        }
      }

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
    const record = await this.recordModel.findById(recordId);
    if (!record) throw new NotFoundException('审批记录不存在');
    if (record.status !== 'pending')
      throw new BadRequestException('该审批已结束');

    const emp = await this.getEmployee(userId);

    const curNode = record.flow_snapshot.nodes[record.cur_node_idx];
    if (!curNode) throw new BadRequestException('当前节点不存在');

    // Verify is current node approver
    const isApprover = curNode.approvers.some((a) => a.name === emp.name);
    if (!isApprover) {
      throw new BadRequestException('您不是当前节点的审批人');
    }

    // Check if already approved
    if (curNode.approved_by?.includes(emp.name)) {
      throw new BadRequestException('您已审批过该节点');
    }

    record.actions.push({
      node_id: curNode.node_id,
      approver_name: emp.name,
      action: 'approve',
      comment: comment || '',
      acted_at: new Date(),
    } as any);

    // Track approval within node
    if (!curNode.approved_by) curNode.approved_by = [];
    curNode.approved_by.push(emp.name);

    if (curNode.sign_type === 'orsign') {
      // Or-sign: one person approves → next node
      record.cur_node_idx += 1;
    } else {
      // Countersign: all approvers must approve → next node
      const allApproved = curNode.approvers.every((a) =>
        curNode.approved_by.includes(a.name),
      );
      if (allApproved) {
        record.cur_node_idx += 1;
      }
    }

    // Check if all nodes approved
    if (record.cur_node_idx >= record.flow_snapshot.nodes.length) {
      record.status = 'approved';
      await this.reimbursementModel.findByIdAndUpdate(record.record_id, {
        status: 'approved',
      });
    }

    await record.save();
    return record;
  }

  // Reject
  async reject(recordId: string, userId: string, comment?: string) {
    const record = await this.recordModel.findById(recordId);
    if (!record) throw new NotFoundException('审批记录不存在');
    if (record.status !== 'pending')
      throw new BadRequestException('该审批已结束');

    const emp = await this.getEmployee(userId);

    const curNode = record.flow_snapshot.nodes[record.cur_node_idx];
    if (!curNode) throw new BadRequestException('当前节点不存在');

    const isApprover = curNode.approvers.some((a) => a.name === emp.name);
    if (!isApprover) {
      throw new BadRequestException('您不是当前节点的审批人');
    }

    record.actions.push({
      node_id: curNode.node_id,
      approver_name: emp.name,
      action: 'reject',
      comment: comment || '',
      acted_at: new Date(),
    } as any);

    record.status = 'rejected';
    await this.reimbursementModel.findByIdAndUpdate(record.record_id, {
      status: 'rejected',
      reject_reason: comment || '审批驳回',
    });

    await record.save();
    return record;
  }

  // Transfer (转审)
  async transfer(
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

    const isApprover = curNode.approvers.some((a) => a.name === emp.name);
    if (!isApprover) {
      throw new BadRequestException('您不是当前节点的审批人');
    }

    // Record transfer action
    record.actions.push({
      node_id: curNode.node_id,
      approver_name: emp.name,
      action: 'transfer',
      comment: comment || '',
      acted_at: new Date(),
      transferred_to_name: targetEmp.name,
    } as any);

    // Track transfer in snapshot: map original → target
    if (!curNode.transfers) curNode.transfers = {};
    curNode.transfers[emp.name] = targetEmp.name;

    // 目标审批人不能是当前节点已有审批人
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
    });

    await record.save();
    return record;
  }
}

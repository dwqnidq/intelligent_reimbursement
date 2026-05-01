import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApprovalRecord } from '../../schemas/approval-record.schema';
import { ApprovalFlow } from '../../schemas/approval-flow.schema';
import { Employee } from '../../schemas/employee.schema';
import { Department } from '../../schemas/department.schema';
import { Reimbursement } from '../../schemas/reimbursement.schema';

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
  ) {}

  // Called when submitting reimbursement: create approval record with snapshot
  async create(reimbursementId: string, typeCode: string) {
    const flow = await this.flowModel
      .findOne({ type_code: typeCode, enabled: true })
      .populate('nodes.approver_id');

    if (!flow) return null; // No approval flow or not enabled — auto-pass

    // Build snapshot: flatten approver info
    const snapshotNodes = [];
    for (const node of flow.nodes) {
      const emp = node.approver_id as unknown as InstanceType<typeof Employee>;
      let deptName = '';
      if (emp.dept_id) {
        const dept = await this.deptModel.findById(emp.dept_id);
        deptName = dept?.name || '';
      }
      snapshotNodes.push({
        node_id: node.node_id,
        name: node.name,
        sign_type: node.sign_type,
        approver: {
          name: emp.name,
          avatar: emp.avatar || '',
          dept_name: deptName,
          position: emp.position || '',
        },
      });
    }

    const record = await this.recordModel.create({
      record_id: new Types.ObjectId(reimbursementId),
      flow_snapshot: {
        name: flow.name,
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
      record_id: new Types.ObjectId(reimbursementId),
    });
  }

  // Get my pending approvals list
  async findMyPending(employeeId: string) {
    const emp = await this.empModel.findById(employeeId);
    if (!emp) throw new NotFoundException('员工不存在');

    return this.recordModel.find({
      status: 'pending',
      'flow_snapshot.nodes': {
        $elemMatch: {
          'approver.name': emp.name,
        },
      },
    });
  }

  // Approve
  async approve(recordId: string, employeeId: string, comment?: string) {
    const record = await this.recordModel.findById(recordId);
    if (!record) throw new NotFoundException('审批记录不存在');
    if (record.status !== 'pending') throw new BadRequestException('该审批已结束');

    const emp = await this.empModel.findById(employeeId);
    if (!emp) throw new NotFoundException('员工不存在');

    const curNode = record.flow_snapshot.nodes[record.cur_node_idx];
    if (!curNode) throw new BadRequestException('当前节点不存在');

    // Verify is current node approver
    if (curNode.approver.name !== emp.name) {
      throw new BadRequestException('您不是当前节点的审批人');
    }

    record.actions.push({
      node_id: curNode.node_id,
      approver_name: emp.name,
      action: 'approve',
      comment: comment || '',
      acted_at: new Date(),
    } as any);

    if (curNode.sign_type === 'orsign') {
      // Or-sign: one person approves → next node
      record.cur_node_idx += 1;
    } else {
      // Countersign: all approvers must approve → next node (simplified: also advance)
      record.cur_node_idx += 1;
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
  async reject(recordId: string, employeeId: string, comment?: string) {
    const record = await this.recordModel.findById(recordId);
    if (!record) throw new NotFoundException('审批记录不存在');
    if (record.status !== 'pending') throw new BadRequestException('该审批已结束');

    const emp = await this.empModel.findById(employeeId);
    if (!emp) throw new NotFoundException('员工不存在');

    const curNode = record.flow_snapshot.nodes[record.cur_node_idx];
    if (!curNode) throw new BadRequestException('当前节点不存在');

    if (curNode.approver.name !== emp.name) {
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
}

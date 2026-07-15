import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApprovalFlow } from '../../schemas/approval_flow.schema';
import { CreateApprovalFlowDto } from './dto/create-approval-flow.dto';
import { UpdateApprovalFlowDto } from './dto/update-approval-flow.dto';

@Injectable()
export class ApprovalFlowService {
  constructor(
    @InjectModel(ApprovalFlow.name)
    private flowModel: Model<ApprovalFlow>,
  ) {}

  async findAll() {
    return this.flowModel
      .find()
      .populate('nodes.approver_ids', 'name avatar position dept_id')
      .populate('created_by', 'real_name')
      .sort({ priority: 1, createdAt: -1 });
  }

  async findOne(id: string) {
    const record = await this.flowModel
      .findById(id)
      .populate('nodes.approver_ids', 'name avatar position dept_id');
    if (!record) throw new NotFoundException('审批流不存在');
    return record;
  }

  /** 保证每个节点 notify_flags 与 approver_ids 等长，缺省 true */
  private normalizeNodes<
    T extends {
      approver_ids: string[];
      notify_flags?: boolean[];
    },
  >(nodes: T[]): T[] {
    return nodes.map((node) => {
      const flags = [...(node.notify_flags ?? [])];
      while (flags.length < node.approver_ids.length) flags.push(true);
      if (flags.length > node.approver_ids.length) {
        flags.length = node.approver_ids.length;
      }
      return { ...node, notify_flags: flags };
    });
  }

  async create(dto: CreateApprovalFlowDto, userId: string) {
    const doc = await this.flowModel.create({
      ...dto,
      nodes: this.normalizeNodes(dto.nodes ?? []),
      created_by: userId,
    } as any);
    return { id: doc._id };
  }

  async update(id: string, dto: UpdateApprovalFlowDto) {
    const record = await this.flowModel.findById(id);
    if (!record) throw new NotFoundException('审批流不存在');

    const next = { ...dto } as UpdateApprovalFlowDto;
    if (next.nodes) {
      next.nodes = this.normalizeNodes(next.nodes);
    }
    Object.assign(record, next);
    await record.save();
    return { id: record._id };
  }

  async toggle(id: string) {
    const record = await this.flowModel.findById(id);
    if (!record) throw new NotFoundException('审批流不存在');
    record.enabled = !record.enabled;
    await record.save();
    return { id: record._id, enabled: record.enabled };
  }

  async remove(id: string) {
    const record = await this.flowModel.findById(id);
    if (!record) throw new NotFoundException('审批流不存在');
    await this.flowModel.deleteOne({ _id: id });
    return { id };
  }

  async reorder(ids: string[]) {
    const ops = ids.map((id, idx) =>
      this.flowModel.updateOne({ _id: id }, { $set: { priority: idx } }),
    );
    await Promise.all(ops);
    return { success: true };
  }

  async findByTypeCode(typeCode: string, amount?: number) {
    const baseFilter: Record<string, unknown> = { type_code: typeCode, enabled: true };

    // Get all enabled flows for this type, sorted by priority ascending
    const flows = await this.flowModel
      .find(baseFilter)
      .sort({ priority: 1 })
      .populate('nodes.approver_ids');

    if (flows.length === 0) return null;

    // First pass: find the highest-priority flow whose amount range matches
    if (amount != null) {
      for (const flow of flows) {
        const minOk = flow.amount_min <= amount;
        const maxOk = flow.amount_max == null || flow.amount_max > amount;
        if (minOk && maxOk) return flow;
      }
    }

    // Fallback: first flow with amount_min=0, amount_max=null (default), or first enabled flow
    const defaultFlow = flows.find(
      (f) => f.amount_min === 0 && f.amount_max == null,
    );
    return defaultFlow ?? flows[0] ?? null;
  }
}

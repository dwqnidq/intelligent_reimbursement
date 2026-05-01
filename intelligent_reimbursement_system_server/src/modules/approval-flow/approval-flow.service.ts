import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApprovalFlow } from '../../schemas/approval-flow.schema';
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
      .populate('nodes.approver_id', 'name avatar position dept_id')
      .populate('created_by', 'real_name')
      .sort({ createdAt: -1 });
  }

  async findOne(id: string) {
    const record = await this.flowModel
      .findById(id)
      .populate('nodes.approver_id', 'name avatar position dept_id');
    if (!record) throw new NotFoundException('审批流不存在');
    return record;
  }

  async create(dto: CreateApprovalFlowDto, userId: string) {
    const exists = await this.flowModel.findOne({ type_code: dto.type_code });
    if (exists) throw new ConflictException('该报销类型已绑定审批流');
    const doc = await this.flowModel.create({ ...dto, created_by: userId } as any);
    return { id: doc._id };
  }

  async update(id: string, dto: UpdateApprovalFlowDto) {
    const record = await this.flowModel.findById(id);
    if (!record) throw new NotFoundException('审批流不存在');

    if (dto.type_code && dto.type_code !== record.type_code) {
      const dup = await this.flowModel.findOne({ type_code: dto.type_code });
      if (dup) throw new ConflictException('该报销类型已绑定审批流');
    }

    Object.assign(record, dto);
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

  async findByTypeCode(typeCode: string) {
    return this.flowModel.findOne({ type_code: typeCode, enabled: true });
  }
}

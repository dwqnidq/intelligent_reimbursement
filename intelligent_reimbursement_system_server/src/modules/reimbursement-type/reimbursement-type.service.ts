import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReimbursementType } from '../../schemas/reimbursement_type.schema';
import { User } from '../../schemas/user.schema';
import { CreateReimbursementTypeDto } from './dto/create-reimbursement-type.dto';
import { UpdateReimbursementTypeDto } from './dto/update-reimbursement-type.dto';

@Injectable()
export class ReimbursementTypeService {
  constructor(
    @InjectModel(ReimbursementType.name)
    private typeModel: Model<ReimbursementType>,
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {}

  async findAll(userId: string) {
    const user = await this.userModel.findById(userId).populate('roles');
    const roles = user?.roles as unknown as { name: string }[];
    const isAdmin = roles?.some((r) => r.name === 'admin') ?? false;

    const filter = isAdmin ? {} : { status: 1 };
    return this.typeModel
      .find(filter)
      .select('code label fields formula over_limit_threshold export_fields status')
      .sort({ createdAt: 1 });
  }

  async create(dto: CreateReimbursementTypeDto | CreateReimbursementTypeDto[]) {
    const items = (Array.isArray(dto) ? dto : [dto]).filter(Boolean);
    if (items.length === 0) {
      throw new BadRequestException('请求体不能为空');
    }

    const codeSet = new Set<string>();
    const labelSet = new Set<string>();
    for (const item of items) {
      const code = String(item.code ?? '').trim();
      const label = String(item.label ?? '').trim();
      if (!code || !label) {
        throw new BadRequestException('code 和 label 为必填项');
      }
      if (codeSet.has(code)) {
        throw new ConflictException(`类型标识符「${code}」在本次请求中重复`);
      }
      if (labelSet.has(label)) {
        throw new ConflictException(`类型名称「${label}」在本次请求中重复`);
      }
      codeSet.add(code);
      labelSet.add(label);
    }

    const exists = await this.typeModel.find({
      $or: [
        { code: { $in: [...codeSet] } },
        { label: { $in: [...labelSet] } },
      ],
    });
    if (exists.length > 0) {
      const hitCode = exists.find((x) => codeSet.has(x.code));
      if (hitCode) throw new ConflictException(`类型标识符「${hitCode.code}」已存在`);
      const hitLabel = exists.find((x) => labelSet.has(x.label));
      if (hitLabel) throw new ConflictException(`类型名称「${hitLabel.label}」已存在`);
    }

    const docs = items.map((item) => ({
      ...item,
      code: String(item.code).trim(),
      label: String(item.label).trim(),
    }));
    const inserted = await this.typeModel.insertMany(docs);
    return {
      count: inserted.length,
      ids: inserted.map((x) => x._id),
    };
  }

  async update(id: string, dto: UpdateReimbursementTypeDto) {
    const record = await this.typeModel.findById(id);
    if (!record) throw new NotFoundException('报销类型不存在');

    if (dto.code || dto.label) {
      const query: {
        _id: { $ne: string };
        code?: string;
        label?: string;
      } = { _id: { $ne: id } };
      if (dto.code) query.code = dto.code;
      if (dto.label) query.label = dto.label;
      const exists = await this.typeModel.findOne(query);
      if (exists) {
        if (dto.code && exists.code === dto.code)
          throw new ConflictException('类型标识符已存在');
        if (dto.label && exists.label === dto.label)
          throw new ConflictException('类型名称已存在');
      }
    }

    Object.assign(record, dto);
    await record.save();
    return { id: record._id };
  }

  async remove(id: string) {
    const record = await this.typeModel.findById(id);
    if (!record) throw new NotFoundException('报销类型不存在');
    await this.typeModel.deleteOne({ _id: id });
    return { id };
  }
}

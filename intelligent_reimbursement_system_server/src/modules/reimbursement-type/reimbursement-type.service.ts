import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReimbursementType } from '../../schemas/reimbursement_type.schema';
import { User } from '../../schemas/user.schema';
import { CreateReimbursementTypeDto } from './dto/create-reimbursement-type.dto';
import { UpdateReimbursementTypeDto } from './dto/update-reimbursement-type.dto';
import { normalizeTypeFieldsOptions } from '../../common/field-options.util';

@Injectable()
export class ReimbursementTypeService implements OnModuleInit {
  constructor(
    @InjectModel(ReimbursementType.name)
    private typeModel: Model<ReimbursementType>,
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {}

  async onModuleInit() {
    await this.typeModel.syncIndexes();
  }

  async findAll(userId: string) {
    const user = await this.userModel.findById(userId).populate('roles');
    const roles = user?.roles as unknown as { name: string }[];
    const isAdmin = roles?.some((r) => r.name === 'admin') ?? false;

    const filter = isAdmin ? {} : { status: 1 };
    return this.typeModel
      .find(filter)
      .select(
        'code name label fields formula over_limit_threshold export_fields status remark description',
      )
      .sort({ createdAt: 1 });
  }

  async create(dto: CreateReimbursementTypeDto | CreateReimbursementTypeDto[]) {
    const items = (Array.isArray(dto) ? dto : [dto]).filter(Boolean);
    if (items.length === 0) {
      throw new BadRequestException('请求体不能为空');
    }

    const codeSet = new Set<string>();
    const nameSet = new Set<string>();
    for (const item of items) {
      const code = String(item.code ?? '').trim();
      const name = String(item.name ?? '').trim();
      const label = String(item.label ?? '').trim();
      if (!code || !name || !label) {
        throw new BadRequestException('code、name 和 label 为必填项');
      }
      if (codeSet.has(code)) {
        throw new ConflictException(`类型标识符「${code}」在本次请求中重复`);
      }
      if (nameSet.has(name)) {
        throw new ConflictException(`报销类型「${name}」在本次请求中重复`);
      }
      codeSet.add(code);
      nameSet.add(name);
    }

    const exists = await this.typeModel.find({
      $or: [
        { code: { $in: [...codeSet] } },
        { name: { $in: [...nameSet] } },
      ],
    });
    if (exists.length > 0) {
      const hitCode = exists.find((x) => codeSet.has(x.code));
      if (hitCode) {
        throw new ConflictException(`类型标识符「${hitCode.code}」已存在`);
      }
      const hitName = exists.find((x) => nameSet.has(x.name));
      if (hitName) {
        throw new ConflictException(`报销类型「${hitName.name}」已存在`);
      }
    }

    const docs = items.map((item) => ({
      ...item,
      code: String(item.code).trim(),
      name: String(item.name).trim(),
      label: String(item.label).trim(),
      fields: normalizeTypeFieldsOptions(item.fields),
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

    if (dto.code || dto.name) {
      const orConditions: Array<{ code: string } | { name: string }> = [];
      if (dto.code) orConditions.push({ code: dto.code });
      if (dto.name) orConditions.push({ name: dto.name });
      const exists = await this.typeModel.findOne({
        _id: { $ne: id },
        $or: orConditions,
      });
      if (exists) {
        if (dto.code && exists.code === dto.code) {
          throw new ConflictException('类型标识符已存在');
        }
        if (dto.name && exists.name === dto.name) {
          throw new ConflictException('报销类型名称已存在');
        }
      }
    }

    const patch = { ...dto };
    if (dto.fields !== undefined) {
      patch.fields = normalizeTypeFieldsOptions(dto.fields);
    }
    Object.assign(record, patch);
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
